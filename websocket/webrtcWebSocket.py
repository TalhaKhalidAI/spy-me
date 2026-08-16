# App/websocket/webrtcWebSocket.py
from fastapi import WebSocket, WebSocketDisconnect
import json
import logging
from typing import Dict, Set

from App.repository.webrtcRepository import WebRTCRepository

logger = logging.getLogger(__name__)

# Store active WebSocket connections
active_connections: Dict[str, WebSocket] = {}
room_connections: Dict[str, Set[str]] = {}

# ✅ SINGLE REPOSITORY INSTANCE
_repo: WebRTCRepository = None

def get_repo():
    """Get or create WebRTC repository"""
    global _repo
    if _repo is None:
        _repo = WebRTCRepository()
        import asyncio
        asyncio.create_task(_repo.initialize())
    return _repo


class WebRTCWebSocketManager:
    """WebSocket manager for WebRTC signaling"""
    
    def __init__(self, repo: WebRTCRepository):
        self.repo = repo
    
    async def handle_connection(self, websocket: WebSocket, room_id: str, peer_id: str):
        await websocket.accept()
        
        active_connections[peer_id] = websocket
        if room_id not in room_connections:
            room_connections[room_id] = set()
        room_connections[room_id].add(peer_id)
        
        logger.info(f"WebSocket connected: peer {peer_id} in room {room_id}")
        
        try:
            await websocket.send_json({
                "type": "connected",
                "peer_id": peer_id,
                "room_id": room_id
            })
            
            while True:
                message = await websocket.receive_json()
                await self._handle_message(peer_id, room_id, message)
                
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: peer {peer_id}")
        except Exception as e:
            logger.error(f"WebSocket error for peer {peer_id}: {e}")
        finally:
            if peer_id in active_connections:
                del active_connections[peer_id]
            if room_id in room_connections:
                room_connections[room_id].discard(peer_id)
            await self.repo.disconnect_peer(peer_id)
    
    async def _handle_message(self, peer_id: str, room_id: str, message: Dict):
        msg_type = message.get("type")
        
        if msg_type == "offer":
            target_peer = message.get("target_peer")
            if target_peer and target_peer in active_connections:
                await active_connections[target_peer].send_json({
                    "type": "offer",
                    "from_peer": peer_id,
                    "sdp": message.get("sdp"),
                    "sdp_type": message.get("sdp_type", "offer")
                })
            else:
                result = await self.repo.handle_offer(peer_id, message["sdp"])
                if result.get("success"):
                    await active_connections[peer_id].send_json({
                        "type": "answer",
                        "sdp": result["sdp"],
                        "sdp_type": result["type"]
                    })
        
        elif msg_type == "answer":
            target_peer = message.get("target_peer")
            if target_peer and target_peer in active_connections:
                await active_connections[target_peer].send_json({
                    "type": "answer",
                    "from_peer": peer_id,
                    "sdp": message.get("sdp"),
                    "sdp_type": message.get("sdp_type", "answer")
                })
            else:
                await self.repo.handle_answer(peer_id, message["sdp"])
                await active_connections[peer_id].send_json({
                    "type": "answered",
                    "success": True
                })
        
        elif msg_type == "ice_candidate":
            target_peer = message.get("target_peer")
            if target_peer and target_peer in active_connections:
                await active_connections[target_peer].send_json({
                    "type": "ice_candidate",
                    "from_peer": peer_id,
                    "candidate": message.get("candidate")
                })
            else:
                await self.repo.add_ice_candidate(peer_id, message["candidate"])
        
        elif msg_type == "create_offer":
            result = await self.repo.create_offer(peer_id)
            if result.get("success"):
                await active_connections[peer_id].send_json({
                    "type": "offer",
                    "sdp": result["sdp"],
                    "sdp_type": result["type"]
                })
        
        elif msg_type == "auto_connect":
            target_peer = message.get("target_peer")
            if target_peer:
                result = await self.repo.auto_connect(peer_id, target_peer)
                await active_connections[peer_id].send_json({
                    "type": "auto_connect_result",
                    "result": result
                })
                if target_peer in active_connections:
                    await active_connections[target_peer].send_json({
                        "type": "auto_connect_result",
                        "result": result
                    })
        
        elif msg_type == "get_peers":
            room = await self.repo.get_room(room_id)
            if room:
                await active_connections[peer_id].send_json({
                    "type": "peers",
                    "peers": list(room.peers.keys()) if room.peers else []
                })
        
        elif msg_type == "ping":
            await active_connections[peer_id].send_json({
                "type": "pong"
            })
        
        elif msg_type == "request_offer":
            result = await self.repo.create_offer(peer_id)
            if result.get("success"):
                await active_connections[peer_id].send_json({
                    "type": "offer",
                    "from_server": True,
                    "sdp": result["sdp"],
                    "sdp_type": result["type"]
                })
        
        else:
            logger.warning(f"Unknown message type: {msg_type}")


# ============== WEBSOCKET ENDPOINT ==============
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    peer_id: str
):
    """WebSocket endpoint for WebRTC signaling"""
    repo = get_repo()  # ✅ Get repo directly
    manager = WebRTCWebSocketManager(repo)
    await manager.handle_connection(websocket, room_id, peer_id)