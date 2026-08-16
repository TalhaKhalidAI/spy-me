# App/services/webrtcService.py
from typing import Optional, List, Dict, Any, Tuple
from App.repository.webrtcRepository import WebRTCRepository
from App.core.aioRtcHelper import PeerRole, TrackInfo
from aiortc import MediaStreamTrack
import logging

logger = logging.getLogger(__name__)


class WebRTCService:
    """Service layer for WebRTC operations"""
    
    def __init__(self):
        self.repo = WebRTCRepository()
    
    async def initialize(self):
        await self.repo.initialize()
    
    async def shutdown(self):
        await self.repo.shutdown()
    
    # ============== ROOM OPERATIONS ==============
    async def create_room(self, room_id: str, password: Optional[str] = None) -> Dict:
        try:
            room = await self.repo.create_room(room_id, password)
            return {
                "success": True,
                "room_id": room.room_id,
                "password_protected": room.password is not None,
                "created_at": room.created_at
            }
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    async def get_room(self, room_id: str) -> Optional[Dict]:
        room = await self.repo.get_room(room_id)
        if not room:
            return None
        return {
            "room_id": room.room_id,
            "peer_count": len(room.peers),
            "created_at": room.created_at,
            "password_protected": room.password is not None,
            "peers": [
                {
                    "peer_id": pid,
                    "role": p.role.value,
                    "track_count": len(p.tracks)
                }
                for pid, p in room.peers.items()
            ]
        }
    
    async def delete_room(self, room_id: str) -> Dict:
        try:
            await self.repo.delete_room(room_id)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def list_rooms(self) -> List[str]:
        return await self.repo.list_rooms()
    
    async def get_room_stats(self, room_id: str) -> Dict:
        return await self.repo.get_room_stats(room_id)
    
    # ============== PEER OPERATIONS ==============
    async def create_peer(
        self,
        room_id: str,
        peer_id: Optional[str] = None,
        role: str = "both",
        password: Optional[str] = None
    ) -> Dict:
        try:
            role_map = {
                "publisher": PeerRole.PUBLISHER,
                "subscriber": PeerRole.SUBSCRIBER,
                "both": PeerRole.BOTH
            }
            peer_role = role_map.get(role.lower(), PeerRole.BOTH)
            
            peer_id, pc = await self.repo.create_peer(
                room_id, peer_id, peer_role, password
            )
            return {
                "success": True,
                "peer_id": peer_id,
                "room_id": room_id,
                "role": role,
                "message": "Peer created successfully"
            }
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    async def get_peer(self, peer_id: str) -> Optional[Dict]:
        return await self.repo.get_peer_info(peer_id)
    
    async def disconnect_peer(self, peer_id: str) -> Dict:
        try:
            await self.repo.disconnect_peer(peer_id)
            return {"success": True, "peer_id": peer_id}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ============== TRACK OPERATIONS ==============
    async def add_track(self, peer_id: str, track: MediaStreamTrack) -> Dict:
        try:
            track_id = await self.repo.add_track(peer_id, track)
            return {
                "success": True,
                "track_id": track_id,
                "kind": track.kind,
                "peer_id": peer_id
            }
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    async def remove_track(self, peer_id: str, track_id: str) -> Dict:
        try:
            await self.repo.remove_track(peer_id, track_id)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def enable_track(self, peer_id: str, track_id: str, enabled: bool) -> Dict:
        try:
            await self.repo.enable_track(peer_id, track_id, enabled)
            return {"success": True, "enabled": enabled}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_peer_tracks(self, peer_id: str) -> List[Dict]:
        tracks = await self.repo.get_peer_tracks(peer_id)
        return [
            {
                "track_id": t.track_id,
                "kind": t.kind,
                "enabled": t.enabled
            }
            for t in tracks
        ]
    
    # ============== SIGNALING OPERATIONS ==============
    async def create_offer(self, peer_id: str) -> Dict:
        try:
            offer = await self.repo.create_offer(peer_id)
            return {"success": True, **offer}
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    async def handle_offer(self, peer_id: str, sdp: str) -> Dict:
        try:
            answer = await self.repo.handle_offer(peer_id, sdp)
            return {"success": True, **answer}
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    async def handle_answer(self, peer_id: str, sdp: str) -> Dict:
        try:
            await self.repo.handle_answer(peer_id, sdp)
            return {"success": True}
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    async def add_ice_candidate(self, peer_id: str, candidate: Dict) -> Dict:
        try:
            await self.repo.add_ice_candidate(peer_id, candidate)
            return {"success": True}
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    # ============== AUTO CONNECT ==============
    async def auto_connect_peers(self, peer_a_id: str, peer_b_id: str) -> Dict:
        """
        Automatically connect two peers with full SDP exchange.
        """
        try:
            # Check both peers exist
            if not await self.repo.peer_exists(peer_a_id):
                return {"success": False, "error": f"Peer {peer_a_id} not found"}
            if not await self.repo.peer_exists(peer_b_id):
                return {"success": False, "error": f"Peer {peer_b_id} not found"}
            
            # Step 1: Peer A creates offer
            offer = await self.repo.create_offer(peer_a_id)
            
            # Step 2: Peer B handles offer and creates answer
            answer = await self.repo.handle_offer(peer_b_id, offer["sdp"])
            
            # Step 3: Peer A sets answer
            await self.repo.handle_answer(peer_a_id, answer["sdp"])
            
            return {
                "success": True,
                "peer_a": peer_a_id,
                "peer_b": peer_b_id,
                "offer": offer,
                "answer": answer
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ============== STATS ==============
    async def get_global_stats(self) -> Dict:
        return await self.repo.get_global_stats()