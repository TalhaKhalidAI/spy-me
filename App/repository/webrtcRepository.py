# App/repository/webrtcRepository.py
from typing import Optional, List, Dict, Any, Tuple
from aiortc import MediaStreamTrack
from App.core.aioRtcHelper import (
    IORTCFastAPIHelper,
    IORTCConfig,
    PeerRole,
    TrackInfo,
    PeerInfo,
    RoomInfo,
    create_helper
)
from App.core.settings import settings  
import logging

logger = logging.getLogger(__name__)


class WebRTCRepository:
    """WebRTC Repository - Direct access to IORTC helper"""
    
    _instance = None
    _helper: Optional[IORTCFastAPIHelper] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def initialize(self):
        if self._helper is None:
            config = IORTCConfig(
                ice_servers=settings.ICE_SERVERS,
                max_peers_total=settings.MAX_PEER_TOTAL,
                max_peers_per_room=settings.MAX_PEER_PER_ROOM,
                ice_timeout_seconds=settings.ICE_TIMEOUT_SECONDS,
                heartbeat_timeout_seconds=settings.HEARTBEAT_TIMEOUT_SECONDS,
                enable_rate_limiting=settings.ENABLE_RATE_LIMIT,
                max_offers_per_minute=settings.MAX_OFFER_PER_MINUTE
            )
            
            self._helper = create_helper(config)
            await self._helper.start()
            logger.info("WebRTC Repository initialized")
        return self._helper
    
    async def shutdown(self):
        if self._helper:
            await self._helper.shutdown()
            self._helper = None
            logger.info("WebRTC Repository shutdown")
    
    # ============== ROOM ==============
    async def create_room(self, room_id: str, password: Optional[str] = None):
        helper = await self.initialize()
        return await helper.create_room(room_id, password)
    
    async def get_room(self, room_id: str):
        helper = await self.initialize()
        return helper.get_room(room_id)
    
    async def delete_room(self, room_id: str):
        helper = await self.initialize()
        await helper.delete_room(room_id)
    
    async def list_rooms(self) -> List[str]:
        helper = await self.initialize()
        return list(helper.rooms.keys())
    
    # ============== PEER ==============
    async def create_peer(self, room_id: str, peer_id: Optional[str] = None, 
                          role: PeerRole = PeerRole.BOTH, password: Optional[str] = None):
        helper = await self.initialize()
        return await helper.create_peer(room_id, role, peer_id, password)
    
    async def get_peer(self, peer_id: str) -> Optional[PeerInfo]:
        helper = await self.initialize()
        return await helper.get_peer(peer_id)
    
    async def disconnect_peer(self, peer_id: str):
        helper = await self.initialize()
        await helper.disconnect_peer(peer_id)
    
    async def peer_exists(self, peer_id: str) -> bool:
        helper = await self.initialize()
        return await helper.peer_exists(peer_id)
    
    # ============== TRACK ==============
    async def add_track(self, peer_id: str, track: MediaStreamTrack) -> str:
        helper = await self.initialize()
        return await helper.add_track(peer_id, track)
    
    async def remove_track(self, peer_id: str, track_id: str):
        helper = await self.initialize()
        await helper.remove_track(peer_id, track_id)
    
    async def enable_track(self, peer_id: str, track_id: str, enabled: bool):
        helper = await self.initialize()
        await helper.enable_track(peer_id, track_id, enabled)
    
    async def get_tracks(self, peer_id: str) -> List[TrackInfo]:
        helper = await self.initialize()
        return await helper.get_tracks(peer_id)
    
    async def get_peer_tracks(self, peer_id: str) -> List[Dict]:
        tracks = await self.get_tracks(peer_id)
        return [
            {
                "track_id": t.track_id,
                "kind": t.kind,
                "enabled": t.enabled
            }
            for t in tracks
        ]
    
    # ============== SIGNALING ==============
    async def create_offer(self, peer_id: str) -> Dict[str, str]:
        helper = await self.initialize()
        return await helper.create_offer(peer_id)
    
    async def handle_offer(self, peer_id: str, sdp: str) -> Dict[str, str]:
        helper = await self.initialize()
        return await helper.handle_offer(peer_id, sdp)
    
    async def handle_answer(self, peer_id: str, sdp: str):
        helper = await self.initialize()
        await helper.handle_answer(peer_id, sdp)
    
    async def add_ice_candidate(self, peer_id: str, candidate: Dict):
        helper = await self.initialize()
        await helper.add_ice_candidate(peer_id, candidate)
    
    # ============== AUTO CONNECT ==============
    async def auto_connect(self, peer_a_id: str, peer_b_id: str) -> Dict:
        """Auto-connect two peers with full SDP exchange"""
        helper = await self.initialize()
        
        if not await helper.peer_exists(peer_a_id):
            return {"success": False, "error": f"Peer {peer_a_id} not found"}
        if not await helper.peer_exists(peer_b_id):
            return {"success": False, "error": f"Peer {peer_b_id} not found"}
        
        try:
            offer = await helper.create_offer(peer_a_id)
            answer = await helper.handle_offer(peer_b_id, offer["sdp"])
            await helper.handle_answer(peer_a_id, answer["sdp"])
            
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
        helper = await self.initialize()
        return helper.get_global_stats()
    
    async def get_room_stats(self, room_id: str) -> Dict:
        helper = await self.initialize()
        return helper.get_room_stats(room_id)
    
    async def get_peer_info(self, peer_id: str) -> Dict:
        peer = await self.get_peer(peer_id)
        if not peer:
            return {}
        return {
            "peer_id": peer.peer_id,
            "room_id": peer.room_id,
            "role": peer.role.value,
            "track_count": len(peer.tracks),
            "connected_at": peer.connected_at,
            "tracks": [
                {"track_id": t.track_id, "kind": t.kind, "enabled": t.enabled}
                for t in peer.tracks
            ]
        }