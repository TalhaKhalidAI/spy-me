# App/websocket/webrtcWebSocket.py
from fastapi import WebSocket, WebSocketDisconnect
import json
import logging
from typing import Dict, Set, Optional
import asyncio

from App.repository.webrtcRepository import WebRTCRepository
from App.core.aioRtcHelper import PeerRole

logger = logging.getLogger(__name__)

# Store active WebSocket connections
active_connections: Dict[str, WebSocket] = {}
room_connections: Dict[str, Set[str]] = {}

_repo: Optional[WebRTCRepository] = None
_repo_lock = asyncio.Lock()


async def get_repo():
    """Get or create WebRTC repository instance (async safe)"""
    global _repo
    async with _repo_lock:
        if _repo is None:
            _repo = WebRTCRepository()
            await _repo.initialize()
            logger.info("WebRTC Repository initialized for WebSocket")
        return _repo


class WebRTCWebSocketManager:
    """WebRTC WebSocket manager with full repository integration"""
    
    def __init__(self, repo: WebRTCRepository):
        self.repo = repo
    
    async def handle_connection(self, websocket: WebSocket, room_id: str, peer_id: str):
        """Handle a WebSocket connection"""
        await websocket.accept()
        
        # Store connection
        active_connections[peer_id] = websocket
        if room_id not in room_connections:
            room_connections[room_id] = set()
        room_connections[room_id].add(peer_id)
        
        logger.info(f"[+] WebSocket connected: {peer_id} in room {room_id}")
        
        try:
            # Send initial connection info
            await websocket.send_json({
                "type": "connected",
                "peer_id": peer_id,
                "room_id": room_id,
                "peers_in_room": list(room_connections.get(room_id, []))
            })
            
            # Broadcast peer joined to others in room
            await self._broadcast_to_room(room_id, peer_id, {
                "type": "peer_joined",
                "peer_id": peer_id
            })
            
            # Message loop
            while True:
                message = await websocket.receive_json()
                await self._handle_message(peer_id, room_id, message)
                
        except WebSocketDisconnect:
            logger.info(f"[-] WebSocket disconnected: {peer_id}")
        except json.JSONDecodeError as e:
            logger.error(f"[!] Invalid JSON from {peer_id}: {e}")
            await self._send_error(peer_id, f"Invalid JSON: {str(e)}")
        except Exception as e:
            logger.error(f"[!] WebSocket error for {peer_id}: {e}")
            await self._send_error(peer_id, f"Internal error: {str(e)}")
        finally:
            # Cleanup
            await self._cleanup_peer(peer_id, room_id)
    
    async def _cleanup_peer(self, peer_id: str, room_id: str):
        """Clean up peer connections"""
        if peer_id in active_connections:
            del active_connections[peer_id]
        if room_id in room_connections:
            room_connections[room_id].discard(peer_id)
            if not room_connections[room_id]:
                del room_connections[room_id]
        
        # Disconnect peer from repository
        try:
            await self.repo.disconnect_peer(peer_id)
        except Exception as e:
            logger.warning(f"Error disconnecting peer {peer_id}: {e}")
        
        # Broadcast peer left
        await self._broadcast_to_room(room_id, peer_id, {
            "type": "peer_left",
            "peer_id": peer_id
        }, exclude=peer_id)
    
    async def _broadcast_to_room(self, room_id: str, sender: str, message: dict, exclude: str = None):
        """Broadcast message to all peers in a room except the sender"""
        if room_id not in room_connections:
            return
        
        for peer_id in list(room_connections[room_id]):
            if peer_id == exclude:
                continue
            if peer_id in active_connections:
                try:
                    await active_connections[peer_id].send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to broadcast to {peer_id}: {e}")
    
    async def _send_error(self, peer_id: str, message: str):
        """Send error message to a peer"""
        if peer_id in active_connections:
            try:
                await active_connections[peer_id].send_json({
                    "type": "error",
                    "message": message
                })
            except Exception:
                pass
    
    async def _send_success(self, peer_id: str, msg_type: str, data: dict = None):
        """Send success message to a peer"""
        if peer_id in active_connections:
            try:
                response = {"type": msg_type, "success": True}
                if data:
                    response.update(data)
                await active_connections[peer_id].send_json(response)
            except Exception:
                pass
    
    async def _handle_message(self, peer_id: str, room_id: str, message: Dict):
        """Handle incoming WebSocket messages"""
        msg_type = message.get("type")
        
        if not msg_type:
            await self._send_error(peer_id, "Missing message type")
            return
        
        try:
            # ============================================================
            # ROOM OPERATIONS
            # ============================================================
            
            if msg_type == "create_room":
                password = message.get("password")
                try:
                    room = await self.repo.create_room(room_id, password)
                    await self._send_success(peer_id, "room_created", {
                        "room_id": room.room_id,
                        "password_protected": room.password is not None,
                        "created_at": room.created_at
                    })
                    logger.info(f"[↻] Room created: {room_id} by {peer_id}")
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
            
            elif msg_type == "delete_room":
                try:
                    await self.repo.delete_room(room_id)
                    await self._send_success(peer_id, "room_deleted", {"room_id": room_id})
                    logger.info(f"[↻] Room deleted: {room_id} by {peer_id}")
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
            
            elif msg_type == "get_room":
                try:
                    room = await self.repo.get_room(room_id)
                    if room:
                        await active_connections[peer_id].send_json({
                            "type": "room_info",
                            "room_id": room.room_id,
                            "peer_count": len(room.peers),
                            "created_at": room.created_at,
                            "password_protected": room.password is not None,
                            "peers": [
                                {"peer_id": pid, "role": p.role.value, "track_count": len(p.tracks)}
                                for pid, p in room.peers.items()
                            ]
                        })
                    else:
                        await self._send_error(peer_id, f"Room {room_id} not found")
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get room: {str(e)}")
            
            elif msg_type == "list_rooms":
                try:
                    rooms = await self.repo.list_rooms()
                    stats = await self.repo.get_global_stats()
                    await active_connections[peer_id].send_json({
                        "type": "rooms_list",
                        "rooms": rooms,
                        "total": len(rooms),
                        "total_peers": stats.get("total_peers", 0)
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to list rooms: {str(e)}")
            
            # ============================================================
            # PEER OPERATIONS
            # ============================================================
                        
            elif msg_type == "create_peer":
                custom_peer_id = message.get("peer_id")  # ← Allow custom peer_id
                role_str = message.get("role", "both")
                password = message.get("password")
                
                role_map = {
                    "publisher": PeerRole.PUBLISHER,
                    "subscriber": PeerRole.SUBSCRIBER,
                    "both": PeerRole.BOTH
                }
                role = role_map.get(role_str, PeerRole.BOTH)
                
                # Use custom peer_id if provided, otherwise use WebSocket peer_id
                peer_to_create = custom_peer_id if custom_peer_id else peer_id
                
                try:
                    peer_id_created, pc = await self.repo.create_peer(
                        room_id, peer_to_create, role, password  # ← Now uses custom peer_id
                    )
                    await self._send_success(peer_id, "peer_created", {
                        "peer_id": peer_id_created,
                        "room_id": room_id,
                        "role": role.value
                    })
                    logger.info(f"[↻] Peer created: {peer_id_created} in room {room_id}")
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
            
            elif msg_type == "get_peer_info":
                target_peer = message.get("target_peer", peer_id)
                try:
                    peer_info = await self.repo.get_peer_info(target_peer)
                    if peer_info:
                        await active_connections[peer_id].send_json({
                            "type": "peer_info",
                            "peer_info": peer_info
                        })
                    else:
                        await self._send_error(peer_id, f"Peer {target_peer} not found")
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get peer info: {str(e)}")
            
            elif msg_type == "peer_exists":
                target_peer = message.get("target_peer")
                if not target_peer:
                    await self._send_error(peer_id, "Missing target_peer")
                    return
                try:
                    exists = await self.repo.peer_exists(target_peer)
                    await active_connections[peer_id].send_json({
                        "type": "peer_exists",
                        "peer_id": target_peer,
                        "exists": exists
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to check peer: {str(e)}")
            
            elif msg_type == "get_peers":
                try:
                    room = await self.repo.get_room(room_id)
                    peers = list(room.peers.keys()) if room else []
                    await active_connections[peer_id].send_json({
                        "type": "peers",
                        "peers": peers,
                        "room_id": room_id,
                        "count": len(peers)
                    })
                    logger.info(f"[↻] Peers list sent to {peer_id}: {peers}")
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get peers: {str(e)}")
            
            elif msg_type == "disconnect":
                try:
                    await self.repo.disconnect_peer(peer_id)
                    await self._send_success(peer_id, "disconnected")
                    logger.info(f"[↻] Peer {peer_id} disconnected via WebSocket")
                except Exception as e:
                    await self._send_error(peer_id, f"Disconnect failed: {str(e)}")
            
            # ============================================================
            # TRACK OPERATIONS
            # ============================================================
            
            elif msg_type == "get_tracks":
                target_peer = message.get("target_peer", peer_id)
                try:
                    tracks = await self.repo.get_tracks(target_peer)
                    await active_connections[peer_id].send_json({
                        "type": "tracks",
                        "peer_id": target_peer,
                        "tracks": [
                            {"track_id": t.track_id, "kind": t.kind, "enabled": t.enabled}
                            for t in tracks
                        ],
                        "count": len(tracks)
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get tracks: {str(e)}")
            
            elif msg_type == "get_peer_tracks":
                target_peer = message.get("target_peer", peer_id)
                try:
                    tracks = await self.repo.get_peer_tracks(target_peer)
                    await active_connections[peer_id].send_json({
                        "type": "peer_tracks",
                        "peer_id": target_peer,
                        "tracks": tracks,
                        "count": len(tracks)
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get tracks: {str(e)}")
            
            elif msg_type == "enable_track":
                track_id = message.get("track_id")
                enabled = message.get("enabled", True)
                if not track_id:
                    await self._send_error(peer_id, "Missing track_id")
                    return
                try:
                    await self.repo.enable_track(peer_id, track_id, enabled)
                    await self._send_success(peer_id, "track_enabled", {
                        "track_id": track_id,
                        "enabled": enabled
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to enable track: {str(e)}")
            
            elif msg_type == "remove_track":
                track_id = message.get("track_id")
                if not track_id:
                    await self._send_error(peer_id, "Missing track_id")
                    return
                try:
                    await self.repo.remove_track(peer_id, track_id)
                    await self._send_success(peer_id, "track_removed", {"track_id": track_id})
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to remove track: {str(e)}")
            
            # ============================================================
            # PEER STATS & RENEGOTIATION
            # ============================================================
            
            elif msg_type == "get_peer_stats":
                target_peer = message.get("target_peer", peer_id)
                try:
                    stats = await self.repo.get_peer_stats(target_peer)
                    await active_connections[peer_id].send_json({
                        "type": "peer_stats",
                        "peer_id": target_peer,
                        "stats": stats
                    })
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get peer stats: {str(e)}")
            
            elif msg_type == "renegotiate":
                try:
                    result = await self.repo.renegotiate(peer_id)
                    await self._send_success(peer_id, "renegotiated", result)
                    logger.info(f"[↻] Renegotiated: {peer_id}")
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
                except Exception as e:
                    await self._send_error(peer_id, f"Renegotiation failed: {str(e)}")
            
            # ============================================================
            # SIGNALING
            # ============================================================
            
            elif msg_type == "create_offer":
                target_peer = message.get("target_peer")
                
                if not target_peer:
                    await self._send_error(peer_id, "Missing target_peer")
                    return
                
                if target_peer not in active_connections:
                    await self._send_error(peer_id, f"Target peer {target_peer} not connected")
                    return
                
                try:
                    result = await self.repo.create_offer(peer_id)
                    
                    await active_connections[target_peer].send_json({
                        "type": "offer",
                        "from_peer": peer_id,
                        "sdp": result["sdp"],
                        "sdp_type": result["type"]
                    })
                    logger.info(f"[→] Offer created and sent: {peer_id} → {target_peer}")
                    
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
                except Exception as e:
                    logger.error(f"Create offer failed: {e}")
                    await self._send_error(peer_id, f"Failed to create offer: {str(e)}")
            
            elif msg_type == "handle_offer":
                target_peer = message.get("target_peer")
                sdp = message.get("sdp")
                
                if not sdp:
                    await self._send_error(peer_id, "Missing SDP")
                    return
                
                try:
                    result = await self.repo.handle_offer(peer_id, sdp)
                    
                    if target_peer and target_peer in active_connections:
                        await active_connections[target_peer].send_json({
                            "type": "answer",
                            "from_peer": peer_id,
                            "sdp": result["sdp"],
                            "sdp_type": result["type"]
                        })
                        logger.info(f"[→] Answer forwarded: {peer_id} → {target_peer}")
                    else:
                        await self._send_success(peer_id, "answer", {
                            "sdp": result["sdp"],
                            "sdp_type": result["type"]
                        })
                    
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
                except Exception as e:
                    logger.error(f"Handle offer failed: {e}")
                    await self._send_error(peer_id, f"Failed to handle offer: {str(e)}")
            
            elif msg_type == "handle_answer":
                target_peer = message.get("target_peer")
                sdp = message.get("sdp")
                
                if not sdp:
                    await self._send_error(peer_id, "Missing SDP")
                    return
                
                try:
                    await self.repo.handle_answer(peer_id, sdp)
                    
                    if target_peer and target_peer in active_connections:
                        await active_connections[target_peer].send_json({
                            "type": "answer_handled",
                            "from_peer": peer_id,
                            "success": True
                        })
                        logger.info(f"[→] Answer handled: {peer_id} → {target_peer}")
                    else:
                        await self._send_success(peer_id, "answer_handled")
                    
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
                except Exception as e:
                    logger.error(f"Handle answer failed: {e}")
                    await self._send_error(peer_id, f"Failed to handle answer: {str(e)}")
            
            elif msg_type == "ice_candidate":
                target_peer = message.get("target_peer")
                candidate = message.get("candidate")
                
                if not candidate:
                    await self._send_error(peer_id, "Missing candidate")
                    return
                
                try:
                    if target_peer and target_peer in active_connections:
                        await active_connections[target_peer].send_json({
                            "type": "ice_candidate",
                            "from_peer": peer_id,
                            "candidate": candidate
                        })
                        logger.info(f"[→] ICE forwarded: {peer_id} → {target_peer}")
                    else:
                        await self.repo.add_ice_candidate(peer_id, candidate)
                        await self._send_success(peer_id, "ice_added")
                        
                except ValueError as e:
                    await self._send_error(peer_id, str(e))
                except Exception as e:
                    logger.error(f"ICE candidate failed: {e}")
                    await self._send_error(peer_id, f"Failed to add ICE: {str(e)}")
            
            elif msg_type == "auto_connect":
                target_peer = message.get("target_peer")
                
                if not target_peer:
                    await self._send_error(peer_id, "Missing target_peer")
                    return
                
                if target_peer not in active_connections:
                    await self._send_error(peer_id, f"Target peer {target_peer} not connected")
                    return
                
                try:
                    result = await self.repo.auto_connect(peer_id, target_peer)
                    
                    if result["success"]:
                        await active_connections[peer_id].send_json({
                            "type": "auto_connect_result",
                            "status": "connected",
                            "target_peer": target_peer,
                            "offer": result.get("offer"),
                            "answer": result.get("answer")
                        })
                        await active_connections[target_peer].send_json({
                            "type": "auto_connect_result",
                            "status": "connected",
                            "from_peer": peer_id,
                            "offer": result.get("offer"),
                            "answer": result.get("answer")
                        })
                        logger.info(f"[↔] Auto-connect success: {peer_id} ↔ {target_peer}")
                    else:
                        await self._send_error(peer_id, result.get("error", "Auto-connect failed"))
                        
                except Exception as e:
                    logger.error(f"Auto-connect failed: {e}")
                    await self._send_error(peer_id, f"Auto-connect failed: {str(e)}")
            
            elif msg_type == "check_connection":
                target_peer = message.get("target_peer")
                
                if not target_peer:
                    await self._send_error(peer_id, "Missing target_peer")
                    return
                
                try:
                    status = await self.repo.check_connection_status(peer_id, target_peer)
                    await active_connections[peer_id].send_json({
                        "type": "connection_status",
                        **status
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to check connection: {str(e)}")
            
            # ============================================================
            # STATS
            # ============================================================
            
            elif msg_type == "get_stats":
                try:
                    stats = await self.repo.get_global_stats()
                    room_stats = await self.repo.get_room_stats(room_id) if room_id else {}
                    await active_connections[peer_id].send_json({
                        "type": "stats",
                        "global": stats,
                        "room": room_stats
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Failed to get stats: {str(e)}")
            
            # ============================================================
            # HEARTBEAT
            # ============================================================
            
            elif msg_type == "ping":
                try:
                    await self.repo.update_heartbeat(peer_id)
                    await active_connections[peer_id].send_json({
                        "type": "pong",
                        "timestamp": __import__('time').time()
                    })
                except Exception as e:
                    await self._send_error(peer_id, f"Heartbeat failed: {str(e)}")
            
            # ============================================================
            # UNKNOWN
            # ============================================================
            
            else:
                logger.warning(f"[!] Unknown message type: {msg_type} from {peer_id}")
                await self._send_error(peer_id, f"Unknown message type: {msg_type}")
                
        except Exception as e:
            logger.error(f"[!] Error handling message {msg_type}: {e}")
            await self._send_error(peer_id, f"Internal error: {str(e)}")


# ============================================================
# WEBSOCKET ENDPOINT
# ============================================================
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    peer_id: str
):
    """WebSocket endpoint for WebRTC signaling"""
    repo = await get_repo()
    manager = WebRTCWebSocketManager(repo)
    await manager.handle_connection(websocket, room_id, peer_id)