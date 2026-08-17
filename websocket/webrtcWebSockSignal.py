# App/websocket/webrtcWebSocket.py
from fastapi import WebSocket, WebSocketDisconnect
import json
import logging
from typing import Dict, Set, Optional
import asyncio

from App.repository.webrtcRepository import WebRTCRepository
from App.core.aioRtcHelper import PeerRole

logger = logging.getLogger(__name__)

# Store active WebSocket connections per room
room_connections: Dict[str, Set[str]] = {}
peer_websockets: Dict[str, WebSocket] = {}

_repo: Optional[WebRTCRepository] = None
_repo_lock = asyncio.Lock()


async def get_repo():
    global _repo
    async with _repo_lock:
        if _repo is None:
            _repo = WebRTCRepository()
            await _repo.initialize()
            logger.info("WebRTC Repository initialized")
        return _repo


class WebRTCWebSocketManager:
    def __init__(self, repo: WebRTCRepository):
        self.repo = repo
    
    async def handle_connection(self, websocket: WebSocket, room_id: str, peer_id: str):
        await websocket.accept()
        
        peer_websockets[peer_id] = websocket
        if room_id not in room_connections:
            room_connections[room_id] = set()
        room_connections[room_id].add(peer_id)
        
        logger.info(f"[+] Peer {peer_id} joined room {room_id}")
        
        try:
            await websocket.send_json({
                "type": "connected",
                "peer_id": peer_id,
                "room_id": room_id,
                "peers_in_room": list(room_connections.get(room_id, []))
            })
            
            await self._broadcast(room_id, {
                "type": "peer_joined",
                "peer_id": peer_id,
                "peers": list(room_connections.get(room_id, []))
            }, exclude=peer_id)
            
            while True:
                message = await websocket.receive_json()
                await self._handle_message(peer_id, room_id, message)
                
        except WebSocketDisconnect:
            logger.info(f"[-] Peer {peer_id} disconnected")
        except Exception as e:
            logger.error(f"[!] Error for {peer_id}: {e}")
        finally:
            if peer_id in peer_websockets:
                del peer_websockets[peer_id]
            if room_id in room_connections:
                room_connections[room_id].discard(peer_id)
                if not room_connections[room_id]:
                    del room_connections[room_id]
            
            await self._broadcast(room_id, {
                "type": "peer_left",
                "peer_id": peer_id,
                "peers": list(room_connections.get(room_id, []))
            }, exclude=peer_id)
            
            try:
                await self.repo.disconnect_peer(peer_id)
            except Exception:
                pass
    
    async def _broadcast(self, room_id: str, message: dict, exclude: str = None):
        if room_id not in room_connections:
            return
        for peer_id in list(room_connections[room_id]):
            if peer_id == exclude:
                continue
            if peer_id in peer_websockets:
                try:
                    await peer_websockets[peer_id].send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send to {peer_id}: {e}")
    
    async def _send_to_peer(self, peer_id: str, message: dict):
        if peer_id in peer_websockets:
            try:
                await peer_websockets[peer_id].send_json(message)
                return True
            except Exception as e:
                logger.warning(f"Failed to send to {peer_id}: {e}")
        return False
    
    async def _handle_message(self, peer_id: str, room_id: str, message: Dict):
        msg_type = message.get("type")
        if not msg_type:
            return
        
        # ============================================================
        # ROOM MANAGEMENT
        # ============================================================
        
        if msg_type == "create_room":
            password = message.get("password")
            try:
                room = await self.repo.create_room(room_id, password)
                await self._send_to_peer(peer_id, {
                    "type": "room_created",
                    "success": True,
                    "room_id": room.room_id,
                    "password_protected": room.password is not None
                })
            except ValueError as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        elif msg_type == "get_peers":
            try:
                room = await self.repo.get_room(room_id)
                peers = list(room.peers.keys()) if room else []
                await self._send_to_peer(peer_id, {
                    "type": "peers",
                    "peers": peers,
                    "count": len(peers)
                })
            except Exception as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        # ============================================================
        # PEER OPERATIONS
        # ============================================================
        
        elif msg_type == "create_peer":
            role_str = message.get("role", "both")
            role_map = {
                "publisher": PeerRole.PUBLISHER,
                "subscriber": PeerRole.SUBSCRIBER,
                "both": PeerRole.BOTH
            }
            role = role_map.get(role_str, PeerRole.BOTH)
            
            try:
                peer_id_created, pc = await self.repo.create_peer(
                    room_id, peer_id, role, None
                )
                await self._send_to_peer(peer_id, {
                    "type": "peer_created",
                    "success": True,
                    "peer_id": peer_id_created,
                    "room_id": room_id
                })
                await self._broadcast(room_id, {
                    "type": "peer_joined",
                    "peer_id": peer_id,
                    "peers": list(room_connections.get(room_id, []))
                }, exclude=peer_id)
            except ValueError as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        # ============================================================
        # ✅ STEP 1: CREATE OFFER (tk1 creates offer, returns SDP)
        # ============================================================
        
        elif msg_type == "create_offer":
            target_peer = message.get("target_peer")
            
            if not target_peer:
                await self._send_to_peer(peer_id, {"type": "error", "message": "Missing target_peer"})
                return
            
            if target_peer not in peer_websockets:
                await self._send_to_peer(peer_id, {"type": "error", "message": f"Target peer {target_peer} not connected"})
                return
            
            try:
                # ✅ Server creates offer on peer_id (tk1)
                logger.info(f"[→] Creating offer for {peer_id} → {target_peer}")
                
                # 1. Create offer on tk1 (returns SDP)
                offer = await self.repo.create_offer(peer_id)
                
                # 2. Send offer SDP back to tk1 (response)
                await self._send_to_peer(peer_id, {
                    "type": "offer_created",
                    "success": True,
                    "sdp": offer["sdp"],
                    "sdp_type": offer["type"],
                    "target_peer": target_peer
                })
                
                # 3. Forward offer SDP to tk2
                await self._send_to_peer(target_peer, {
                    "type": "offer",
                    "from_peer": peer_id,
                    "sdp": offer["sdp"],
                    "sdp_type": offer["type"]
                })
                
                logger.info(f"[→] Offer created and sent: {peer_id} → {target_peer}")
                
            except ValueError as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
            except Exception as e:
                logger.error(f"Create offer failed: {e}")
                await self._send_to_peer(peer_id, {"type": "error", "message": f"Failed to create offer: {str(e)}"})
        
        # ============================================================
        # ✅ STEP 2: HANDLE OFFER (tk2 uses SDP, returns answer SDP)
        # ============================================================
 

        elif msg_type == "handle_offer":
            sdp = message.get("sdp")
            target_peer = message.get("target_peer")  # ← Get the original offerer
            
            if not sdp:
                await self._send_to_peer(peer_id, {"type": "error", "message": "Missing SDP"})
                return
            
            try:
                # ✅ Server handles offer on peer_id (tk2) and creates answer
                logger.info(f"[→] Handling offer for {peer_id}")
                
                # 1. Handle offer on tk2 → creates answer SDP
                answer = await self.repo.handle_offer(peer_id, sdp)
                
                # 2. ✅ RETURN answer SDP to tk2 (the caller)
                await self._send_to_peer(peer_id, {
                    "type": "answer_created",
                    "success": True,
                    "sdp": answer["sdp"],
                    "sdp_type": answer["type"]
                })
                logger.info(f"[→] Answer SDP returned to {peer_id}")
                
                # 3. ✅ Auto-forward answer to the original offerer (target_peer)
                if target_peer and target_peer in peer_websockets:
                    await self._send_to_peer(target_peer, {
                        "type": "answer",
                        "from_peer": peer_id,
                        "sdp": answer["sdp"],
                        "sdp_type": answer["type"]
                    })
                    logger.info(f"[→] Answer auto-forwarded: {peer_id} → {target_peer}")
                else:
                    # Fallback: find the other peer in the room
                    room = await self.repo.get_room(room_id)
                    for p in room.peers.values():
                        if p.peer_id != peer_id:
                            await self._send_to_peer(p.peer_id, {
                                "type": "answer",
                                "from_peer": peer_id,
                                "sdp": answer["sdp"],
                                "sdp_type": answer["type"]
                            })
                            logger.info(f"[→] Answer auto-forwarded: {peer_id} → {p.peer_id}")
                            break
                
            except ValueError as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
            except Exception as e:
                logger.error(f"Handle offer failed: {e}")
                await self._send_to_peer(peer_id, {"type": "error", "message": f"Failed to handle offer: {str(e)}"})
        
        # ============================================================
        # ✅ STEP 3: HANDLE ANSWER (tk1 uses answer SDP)
        # ============================================================
        
        elif msg_type == "handle_answer":
            sdp = message.get("sdp")
            
            if not sdp:
                await self._send_to_peer(peer_id, {"type": "error", "message": "Missing SDP"})
                return
            
            try:
                # ✅ Server handles answer on peer_id (tk1)
                logger.info(f"[→] Handling answer for {peer_id}")
                
                # 1. Handle answer on tk1
                await self.repo.handle_answer(peer_id, sdp)
                
                # 2. Send success response back to tk1
                await self._send_to_peer(peer_id, {
                    "type": "answer_handled",
                    "success": True
                })
                
                logger.info(f"[→] Answer handled for {peer_id}")
                
            except ValueError as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
            except Exception as e:
                logger.error(f"Handle answer failed: {e}")
                await self._send_to_peer(peer_id, {"type": "error", "message": f"Failed to handle answer: {str(e)}"})
        
        # ============================================================
        # AUTO CONNECT (Complete SDP Exchange in One Message)
        # ============================================================
        
        elif msg_type == "auto_connect":
            target_peer = message.get("target_peer")
            
            if not target_peer:
                await self._send_to_peer(peer_id, {"type": "error", "message": "Missing target_peer"})
                return
            
            if target_peer not in peer_websockets:
                await self._send_to_peer(peer_id, {"type": "error", "message": f"Target peer {target_peer} not connected"})
                return
            
            try:
                logger.info(f"[↔] Auto-connecting {peer_id} ↔ {target_peer}")
                
                # Use repository's auto_connect (does full SDP exchange)
                result = await self.repo.auto_connect(peer_id, target_peer)
                
                if result["success"]:
                    # Notify both peers
                    await self._send_to_peer(peer_id, {
                        "type": "auto_connect_result",
                        "status": "connected",
                        "target_peer": target_peer,
                        "offer": result.get("offer"),
                        "answer": result.get("answer")
                    })
                    await self._send_to_peer(target_peer, {
                        "type": "auto_connect_result",
                        "status": "connected",
                        "from_peer": peer_id,
                        "offer": result.get("offer"),
                        "answer": result.get("answer")
                    })
                    logger.info(f"[↔] Auto-connect success: {peer_id} ↔ {target_peer}")
                else:
                    await self._send_to_peer(peer_id, {"type": "error", "message": result.get("error", "Auto-connect failed")})
                    
            except Exception as e:
                logger.error(f"Auto-connect failed: {e}")
                await self._send_to_peer(peer_id, {"type": "error", "message": f"Auto-connect failed: {str(e)}"})
        
        # ============================================================
        # ICE CANDIDATE
        # ============================================================
        
        elif msg_type == "ice_candidate":
            target_peer = message.get("target_peer")
            candidate = message.get("candidate")
            
            if not candidate:
                await self._send_to_peer(peer_id, {"type": "error", "message": "Missing candidate"})
                return
            
            if target_peer and target_peer in peer_websockets:
                await self._send_to_peer(target_peer, {
                    "type": "ice_candidate",
                    "from_peer": peer_id,
                    "candidate": candidate
                })
                logger.info(f"[→] ICE: {peer_id} → {target_peer}")
            else:
                try:
                    await self.repo.add_ice_candidate(peer_id, candidate)
                    await self._send_to_peer(peer_id, {"type": "ice_added", "success": True})
                except Exception as e:
                    await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        # ============================================================
        # STATS
        # ============================================================
        
        elif msg_type == "get_stats":
            try:
                stats = await self.repo.get_global_stats()
                await self._send_to_peer(peer_id, {
                    "type": "stats",
                    "stats": stats
                })
            except Exception as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        # ============================================================
        # HEARTBEAT
        # ============================================================
        
        elif msg_type == "ping":
            try:
                await self.repo.update_heartbeat(peer_id)
                await self._send_to_peer(peer_id, {
                    "type": "pong",
                    "timestamp": __import__('time').time()
                })
            except Exception as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        elif msg_type == "disconnect":
            target_peer = message.get("target_peer", peer_id)
            try:
                await self.repo.disconnect_peer(target_peer)
                await self._send_to_peer(peer_id, {
                    "type": "disconnected",
                    "success": True,
                    "peer_id": target_peer
                })
            except Exception as e:
                await self._send_to_peer(peer_id, {"type": "error", "message": str(e)})
        
        else:
            logger.warning(f"[!] Unknown message: {msg_type} from {peer_id}")


# ============================================================
# WEBSOCKET ENDPOINT
# ============================================================
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    peer_id: str
):
    repo = await get_repo()
    manager = WebRTCWebSocketManager(repo)
    await manager.handle_connection(websocket, room_id, peer_id)