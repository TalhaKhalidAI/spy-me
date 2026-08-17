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
    
    # ============== HELPER VALIDATION METHODS ==============
    
    async def _get_helper(self) -> IORTCFastAPIHelper:
        """Get initialized helper instance"""
        return await self.initialize()
    
    # ✅ VALIDATION 1: Room exists
    async def _validate_room_exists(self, room_id: str) -> RoomInfo:
        """Validate room exists"""
        helper = await self._get_helper()
        room = helper.get_room(room_id)
        if not room:
            raise ValueError(f"Room '{room_id}' not found")
        return room
    
    # ✅ VALIDATION 2: Peer exists (ONLY checks existence)
    async def _validate_peer_exists(self, peer_id: str) -> PeerInfo:
        """Validate peer exists and return PeerInfo"""
        helper = await self._get_helper()
        peer = await helper.get_peer(peer_id)
        if not peer:
            raise ValueError(f"Peer '{peer_id}' not found")
        return peer
    
    # ✅ VALIDATION 3: Peer initialized properly (for operations requiring connection)
    async def _validate_peer_initialized(self, peer_id: str) -> PeerInfo:
        """Validate peer is properly initialized (PC exists, not disconnected)"""
        peer = await self._validate_peer_exists(peer_id)
        
        # Check RTCPeerConnection exists
        if not peer.pc:
            raise ValueError(f"Peer '{peer_id}' has no RTCPeerConnection")
        
        # Check peer not disconnected
        if peer.disconnected:
            raise ValueError(f"Peer '{peer_id}' is disconnected")
        
        # ✅ FIXED: Allow 'new' state for new peers, but reject 'failed' and 'closed'
        valid_states = ["new", "checking", "connected", "completed"]
        if peer.pc.connectionState not in valid_states:
            raise ValueError(
                f"Peer '{peer_id}' connection state is '{peer.pc.connectionState}'. "
                f"Expected one of: {', '.join(valid_states)}"
            )
        
        # ✅ FIXED: Allow 'new' state for ICE
        valid_ice_states = ["new", "checking", "connected", "completed"]
        if peer.pc.iceConnectionState not in valid_ice_states:
            raise ValueError(
                f"Peer '{peer_id}' ICE state is '{peer.pc.iceConnectionState}'"
            )
        
        return peer
    
    # ✅ VALIDATION 4: Connection established between 2 peers (for auto-connect)
    async def _validate_peer_connection_between(
        self, 
        peer_a_id: str, 
        peer_b_id: str
    ) -> Tuple[PeerInfo, PeerInfo]:
        """Validate both peers exist and are connected to each other"""
        
        # Validate both peers exist
        peer_a = await self._validate_peer_initialized(peer_a_id)
        peer_b = await self._validate_peer_initialized(peer_b_id)
        
        # ✅ Check both peers are in the SAME room
        if peer_a.room_id != peer_b.room_id:
            raise ValueError(
                f"Peers are in different rooms: '{peer_a.room_id}' vs '{peer_b.room_id}'"
            )
        
        # ✅ Check both peers are connected (or connecting)
        connected_states = ["connected", "completed"]
        if peer_a.pc.connectionState not in connected_states:
            raise ValueError(
                f"Peer '{peer_a_id}' is not connected (state: {peer_a.pc.connectionState})"
            )
        if peer_b.pc.connectionState not in connected_states:
            raise ValueError(
                f"Peer '{peer_b_id}' is not connected (state: {peer_b.pc.connectionState})"
            )
        
        # ✅ Check SDP has been exchanged
        if not peer_a.pc.remoteDescription:
            raise ValueError(f"Peer '{peer_a_id}' has no remote description (SDP not exchanged)")
        if not peer_b.pc.remoteDescription:
            raise ValueError(f"Peer '{peer_b_id}' has no remote description (SDP not exchanged)")
        
        return peer_a, peer_b
    
    # ✅ VALIDATION 5: Prevent duplicate connection
    async def _validate_no_duplicate_connection(
        self, 
        peer_a_id: str, 
        peer_b_id: str
    ) -> bool:
        """Check if connection already exists between two peers"""
        peer_a = await self._validate_peer_exists(peer_a_id)
        peer_b = await self._validate_peer_exists(peer_b_id)
        
        # If both are connected and have remote descriptions, they're already connected
        if (peer_a.pc.connectionState in ["connected", "completed"] and
            peer_b.pc.connectionState in ["connected", "completed"] and
            peer_a.pc.remoteDescription and
            peer_b.pc.remoteDescription):
            return True
        
        return False
    
    # ============== ROOM ==============
    
    async def create_room(self, room_id: str, password: Optional[str] = None):
        helper = await self._get_helper()
        return await helper.create_room(room_id, password)
    
    async def get_room(self, room_id: str):
        return await self._validate_room_exists(room_id)
    
    async def delete_room(self, room_id: str):
        await self._validate_room_exists(room_id)
        helper = await self._get_helper()
        await helper.delete_room(room_id)
    
    async def list_rooms(self) -> List[str]:
        helper = await self._get_helper()
        return list(helper.rooms.keys())
    
    async def get_room_stats(self, room_id: str) -> Dict:
        await self._validate_room_exists(room_id)
        helper = await self._get_helper()
        return helper.get_room_stats(room_id)
    
    # ============== PEER ==============
    
    async def create_peer(self, room_id: str, peer_id: Optional[str] = None, 
                          role: PeerRole = PeerRole.BOTH, password: Optional[str] = None):
        await self._validate_room_exists(room_id)
        helper = await self._get_helper()
        return await helper.create_peer(room_id, role, peer_id, password)
    
    async def get_peer(self, peer_id: str) -> Optional[PeerInfo]:
        return await self._validate_peer_exists(peer_id)
    
    async def disconnect_peer(self, peer_id: str):
        await self._validate_peer_exists(peer_id)
        helper = await self._get_helper()
        await helper.disconnect_peer(peer_id)
    
    async def peer_exists(self, peer_id: str) -> bool:
        helper = await self._get_helper()
        return await helper.peer_exists(peer_id)
    
    # ✅ FIXED: get_peer_info() uses _validate_peer_exists() NOT _validate_peer_initialized()
    async def get_peer_info(self, peer_id: str) -> Dict:
        """Get peer details - ONLY checks if peer exists, NOT connection state"""
        peer = await self._validate_peer_exists(peer_id)  # ← ONLY existence check
        return {
            "peer_id": peer.peer_id,
            "room_id": peer.room_id,
            "role": peer.role.value,
            "track_count": len(peer.tracks),
            "connected_at": peer.connected_at,
            "last_heartbeat": peer.last_heartbeat,
            "disconnected": peer.disconnected,
            "connection_state": peer.pc.connectionState,
            "ice_state": peer.pc.iceConnectionState,
            "has_remote_description": peer.pc.remoteDescription is not None,
            "tracks": [
                {"track_id": t.track_id, "kind": t.kind, "enabled": t.enabled}
                for t in peer.tracks
            ]
        }
    
    # ============== PEER HEARTBEAT ==============
    
    async def update_heartbeat(self, peer_id: str):
        """Update peer heartbeat timestamp"""
        await self._validate_peer_exists(peer_id)
        helper = await self._get_helper()
        await helper.update_heartbeat(peer_id)
    
    # ============== PEER STATS ==============
    
    async def get_peer_stats(self, peer_id: str) -> Dict:
        """Get WebRTC stats for a peer - Requires initialized connection"""
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        return await helper.get_pc_stats(peer_id)
    
    # ============== RENEGOTIATION ==============
    
    async def renegotiate(self, peer_id: str) -> Dict[str, str]:
        """Renegotiate connection with a peer - Requires initialized connection"""
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        return await helper.renegotiate(peer_id)
    
    # ============== TRACK ==============
    
    async def add_track(self, peer_id: str, track: MediaStreamTrack) -> str:
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        return await helper.add_track(peer_id, track)
    
    async def remove_track(self, peer_id: str, track_id: str):
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        await helper.remove_track(peer_id, track_id)
    
    async def enable_track(self, peer_id: str, track_id: str, enabled: bool):
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        await helper.enable_track(peer_id, track_id, enabled)
    
    async def get_tracks(self, peer_id: str) -> List[TrackInfo]:
        await self._validate_peer_exists(peer_id)
        helper = await self._get_helper()
        return await helper.get_tracks(peer_id)
    
    async def get_peer_tracks(self, peer_id: str) -> List[Dict]:
        await self._validate_peer_exists(peer_id)
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
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        return await helper.create_offer(peer_id)
    
    async def handle_offer(self, peer_id: str, sdp: str) -> Dict[str, str]:
        """Handle an SDP offer and return answer."""
        try:
            await self._validate_peer_initialized(peer_id)
        except ValueError as e:
            logger.warning(f"handle_offer validation failed: {e}")
            raise
        
        helper = await self._get_helper()
        try:
            return await helper.handle_offer(peer_id, sdp)
        except ValueError as e:
            # ✅ Re-raise ValueError (caught by route → HTTP 400)
            logger.warning(f"handle_offer failed: {e}")
            raise
        except Exception as e:
            # ✅ Catch ALL exceptions and convert to ValueError
            logger.error(f"Unexpected error in handle_offer: {e}")
            raise ValueError(f"Failed to handle offer: {str(e)}")


    async def handle_answer(self, peer_id: str, sdp: str):
        """Handle an SDP answer."""
        try:
            await self._validate_peer_initialized(peer_id)
        except ValueError as e:
            logger.warning(f"handle_answer validation failed: {e}")
            raise
        
        helper = await self._get_helper()
        try:
            await helper.handle_answer(peer_id, sdp)
        except ValueError as e:
            logger.warning(f"handle_answer failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in handle_answer: {e}")
            raise ValueError(f"Failed to handle answer: {str(e)}")

    
    async def add_ice_candidate(self, peer_id: str, candidate: Dict):
        await self._validate_peer_initialized(peer_id)
        helper = await self._get_helper()
        await helper.add_ice_candidate(peer_id, candidate)
    
    # ============== AUTO CONNECT ==============
    
    async def auto_connect(self, peer_a_id: str, peer_b_id: str) -> Dict:
        """Auto-connect two peers with full validation."""
        helper = await self._get_helper()
        
        # Check both peers exist
        try:
            await self._validate_peer_exists(peer_a_id)
            await self._validate_peer_exists(peer_b_id)
        except ValueError as e:
            return {"success": False, "error": str(e)}
        
        peer_a = await helper.get_peer(peer_a_id)
        peer_b = await helper.get_peer(peer_b_id)
        
        # Check both peers are in the SAME room
        if peer_a.room_id != peer_b.room_id:
            return {
                "success": False, 
                "error": f"Peers are in different rooms: '{peer_a.room_id}' vs '{peer_b.room_id}'"
            }
        
        # Check if connection already exists (prevent duplicate)
        if peer_a.pc.connectionState in ["connected", "completed"] and \
           peer_b.pc.connectionState in ["connected", "completed"] and \
           peer_a.pc.remoteDescription and \
           peer_b.pc.remoteDescription:
            return {
                "success": False,
                "error": f"Peers '{peer_a_id}' and '{peer_b_id}' are already connected",
                "already_connected": True
            }
        
        try:
            offer = await helper.create_offer(peer_a_id)
            answer = await helper.handle_offer(peer_b_id, offer["sdp"])
            await helper.handle_answer(peer_a_id, answer["sdp"])
            
            return {
                "success": True,
                "peer_a": peer_a_id,
                "peer_b": peer_b_id,
                "room_id": peer_a.room_id,
                "offer": offer,
                "answer": answer
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ============== CHECK CONNECTION STATUS ==============
    

    async def check_connection_status(self, peer_a_id: str, peer_b_id: str) -> Dict:
        """Check if two peers are connected to each other."""
        helper = await self._get_helper()
        
        peer_a = await helper.get_peer(peer_a_id)
        peer_b = await helper.get_peer(peer_b_id)
        
        if not peer_a:
            return {"peer_a_exists": False, "error": f"Peer '{peer_a_id}' not found"}
        if not peer_b:
            return {"peer_b_exists": False, "error": f"Peer '{peer_b_id}' not found"}
        
        same_room = peer_a.room_id == peer_b.room_id  # ← FIXED: removed "f"
        
        # ✅ Check if peers are connected
        peer_a_connected = peer_a.pc.connectionState in ["connected", "completed"]
        peer_b_connected = peer_b.pc.connectionState in ["connected", "completed"]
        
        # ✅ Check if SDP was exchanged successfully
        sdp_exchanged = (
            peer_a.pc.localDescription is not None and 
            peer_a.pc.remoteDescription is not None and
            peer_b.pc.localDescription is not None and 
            peer_b.pc.remoteDescription is not None
        )
        
        # ✅ Check if ICE is complete
        ice_complete_a = peer_a.pc.iceConnectionState in ["connected", "completed"]
        ice_complete_b = peer_b.pc.iceConnectionState in ["connected", "completed"]
        
        # ✅ Check if there are any tracks
        has_tracks_a = len(peer_a.tracks) > 0
        has_tracks_b = len(peer_b.tracks) > 0
        
        return {
            "peer_a_id": peer_a_id,
            "peer_b_id": peer_b_id,
            "same_room": same_room,
            "peer_a_connected": peer_a_connected,
            "peer_b_connected": peer_b_connected,
            "peer_a_state": peer_a.pc.connectionState,
            "peer_b_state": peer_b.pc.connectionState,
            "peer_a_ice_state": peer_a.pc.iceConnectionState,
            "peer_b_ice_state": peer_b.pc.iceConnectionState,
            "sdp_exchanged": sdp_exchanged,
            "ice_complete": ice_complete_a and ice_complete_b,
            "has_tracks": has_tracks_a or has_tracks_b,
            "connected": (
                same_room and 
                peer_a_connected and 
                peer_b_connected and 
                sdp_exchanged and 
                ice_complete_a and 
                ice_complete_b
            ),
            "peer_a_room": peer_a.room_id,
            "peer_b_room": peer_b.room_id,
            "peer_a_track_count": len(peer_a.tracks),
            "peer_b_track_count": len(peer_b.tracks)
        }
    # ============== STATS ==============
    
    async def get_global_stats(self) -> Dict:
        helper = await self._get_helper()
        return helper.get_global_stats()