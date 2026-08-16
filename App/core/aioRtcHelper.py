# iortc_helper.py
import asyncio
import uuid
import time
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Callable, Any, Tuple, Set
from enum import Enum
import re

from aiortc import (
    RTCPeerConnection, 
    RTCSessionDescription, 
    RTCConfiguration,
    RTCIceServer,
    MediaStreamTrack,
    RTCIceCandidate
)

logger = logging.getLogger(__name__)


# ============== Configuration ==============
@dataclass
class IORTCConfig:
    """Production configuration"""
    ice_servers: List[RTCIceServer] = field(default_factory=lambda: [
        RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
        RTCIceServer(urls=["stun:stun1.l.google.com:19302"]),
    ])
    max_peers_total: int = 100
    max_peers_per_room: int = 20
    ice_timeout_seconds: int = 10
    heartbeat_timeout_seconds: int = 500
    enable_rate_limiting: bool = True
    max_offers_per_minute: int = 30
    
    def get_rtc_config(self) -> RTCConfiguration:
        return RTCConfiguration(iceServers=self.ice_servers)


# ============== Data Models ==============
class PeerRole(Enum):
    PUBLISHER = "publisher"
    SUBSCRIBER = "subscriber"
    BOTH = "both"

@dataclass
class TrackInfo:
    track_id: str
    kind: str
    peer_id: str
    enabled: bool = True
    track: Optional[MediaStreamTrack] = None
    sender: Optional[Any] = None

@dataclass
class PeerInfo:
    peer_id: str
    room_id: str
    role: PeerRole
    pc: RTCPeerConnection
    tracks: List[TrackInfo] = field(default_factory=list)
    connected_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)
    senders: List[Any] = field(default_factory=list)
    disconnected: bool = False
    
@dataclass
class RoomInfo:
    room_id: str
    peers: Dict[str, PeerInfo] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    password: Optional[str] = None


# ============== Rate Limiter ==============
class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[float]] = {}
    
    def is_allowed(self, key: str) -> bool:
        now = time.time()
        if key not in self.requests:
            self.requests[key] = []
        
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window_seconds]
        
        if len(self.requests[key]) >= self.max_requests:
            return False
        
        self.requests[key].append(now)
        return True


# ============== SDP Validator ==============
class SDPValidator:
    @staticmethod
    def validate_sdp(sdp: str) -> bool:
        if not sdp or len(sdp) > 65536:
            return False
        
        lines = sdp.split('\n')
        if len(lines) < 3:
            return False
        
        has_v = any(line.startswith('v=') for line in lines)
        has_o = any(line.startswith('o=') for line in lines)
        has_s = any(line.startswith('s=') for line in lines)
        
        return has_v and has_o and has_s
    
    @staticmethod
    def validate_fingerprint(sdp: str, expected_fingerprint: Optional[str] = None) -> bool:
        if not expected_fingerprint:
            return True
        
        fingerprint_match = re.search(r'a=fingerprint:sha-256 ([A-F0-9:]+)', sdp, re.IGNORECASE)
        if not fingerprint_match:
            return False
        
        actual = fingerprint_match.group(1)
        return actual == expected_fingerprint


# ============== Core Helper ==============
class IORTCFastAPIHelper:
    """
    Production-ready WebRTC helper with complete track management.
    """
    
    def __init__(self, config: Optional[IORTCConfig] = None):
        self.config = config or IORTCConfig()
        self.rooms: Dict[str, RoomInfo] = {}
        self.peers: Dict[str, PeerInfo] = {}
        self._shutdown_event = asyncio.Event()
        self._monitor_task: Optional[asyncio.Task] = None
        
        self.rate_limiter = RateLimiter(
            max_requests=self.config.max_offers_per_minute
        )
        
        self._ice_events: Dict[str, asyncio.Event] = {}
        
        # Event hooks
        self.on_peer_join: Optional[Callable] = None
        self.on_peer_leave: Optional[Callable] = None
        self.on_track_received: Optional[Callable] = None
        self.on_connection_state_change: Optional[Callable] = None
        
        self._connection_semaphore = asyncio.Semaphore(self.config.max_peers_total)
        
    async def start(self):
        self._monitor_task = asyncio.create_task(self._monitor_connections())
        logger.info("IORTC Helper started")
        
    async def shutdown(self):
        self._shutdown_event.set()
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            
        for peer_id in list(self.peers.keys()):
            await self._close_peer(peer_id)
            
        logger.info("IORTC Helper shutdown complete")

    # ============== Room Management ==============
    async def create_room(self, room_id: str, password: Optional[str] = None) -> RoomInfo:
        if room_id in self.rooms:
            raise ValueError(f"Room {room_id} already exists")
        
        room = RoomInfo(room_id=room_id, password=password)
        self.rooms[room_id] = room
        logger.info(f"Room {room_id} created" + (" with password" if password else ""))
        return room

    async def join_room(self, room_id: str, password: Optional[str] = None) -> RoomInfo:
        if room_id not in self.rooms:
            raise ValueError(f"Room {room_id} does not exist")
        
        room = self.rooms[room_id]
        if room.password and room.password != password:
            raise ValueError("Invalid room password")
        
        return room

    def get_room(self, room_id: str) -> Optional[RoomInfo]:
        return self.rooms.get(room_id)

    async def delete_room(self, room_id: str):
        if room_id not in self.rooms:
            return
        
        room = self.rooms[room_id]
        for peer_id in list(room.peers.keys()):
            await self.disconnect_peer(peer_id)
        
        del self.rooms[room_id]
        logger.info(f"Room {room_id} deleted")

    # ============== Peer Management ==============
    async def create_peer(
        self,
        room_id: str,
        role: PeerRole = PeerRole.BOTH,
        peer_id: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Tuple[str, RTCPeerConnection]:
        
        if self.config.enable_rate_limiting and not self.rate_limiter.is_allowed(room_id):
            raise ValueError("Rate limit exceeded")
        
        async with self._connection_semaphore:
            room = await self.join_room(room_id, password)
            
            if len(room.peers) >= self.config.max_peers_per_room:
                raise ValueError(f"Room {room_id} is full")
            
            peer_id = peer_id or str(uuid.uuid4())
            
            if peer_id in self.peers:
                raise ValueError(f"Peer {peer_id} already exists")
            
            pc = RTCPeerConnection(configuration=self.config.get_rtc_config())
            
            # ICE gathering event
            ice_event = asyncio.Event()
            self._ice_events[peer_id] = ice_event
            
            @pc.on("icegatheringstatechange")
            def on_ice_gathering():
                if pc.iceGatheringState == "complete":
                    if peer_id in self._ice_events:
                        self._ice_events[peer_id].set()
                        logger.info(f"ICE gathering complete for {peer_id}")
            
            @pc.on("connectionstatechange")
            async def on_connection_state_change():
                state = pc.connectionState
                logger.info(f"Connection state for {peer_id}: {state}")
                
                if self.on_connection_state_change:
                    await self.on_connection_state_change(peer_id, state)
                
                if state in ["failed", "closed", "disconnected"]:
                    logger.warning(f"Connection failed for {peer_id}: {state}")
                    await self.disconnect_peer(peer_id)
            
            @pc.on("track")
            async def on_track(track: MediaStreamTrack):
                logger.info(f"Track received: {track.kind}")
                peer_info = self.peers.get(peer_id)
                if peer_info:
                    track_info = TrackInfo(
                        track_id=str(uuid.uuid4()),
                        kind=track.kind,
                        peer_id=peer_id,
                        track=track
                    )
                    peer_info.tracks.append(track_info)
                
                if self.on_track_received:
                    try:
                        await asyncio.wait_for(
                            self.on_track_received(peer_id, track),
                            timeout=5.0
                        )
                    except asyncio.TimeoutError:
                        logger.warning(f"Track handler for {peer_id} timed out")
            
            peer_info = PeerInfo(
                peer_id=peer_id,
                room_id=room_id,
                role=role,
                pc=pc
            )
            self.peers[peer_id] = peer_info
            room.peers[peer_id] = peer_info
            
            if self.on_peer_join:
                await self.on_peer_join(peer_id, room_id)
            
            logger.info(f"Peer {peer_id} created in room {room_id}")
            return peer_id, pc

    async def disconnect_peer(self, peer_id: str):
        if peer_id not in self.peers:
            return
        
        peer_info = self.peers[peer_id]
        
        if peer_info.disconnected:
            return
        peer_info.disconnected = True
        
        room_id = peer_info.room_id
        
        await self._close_peer(peer_id)
        
        if room_id in self.rooms and peer_id in self.rooms[room_id].peers:
            del self.rooms[room_id].peers[peer_id]
            if not self.rooms[room_id].peers:
                del self.rooms[room_id]
        
        del self.peers[peer_id]
        
        if peer_id in self._ice_events:
            del self._ice_events[peer_id]
        
        if self.on_peer_leave:
            await self.on_peer_leave(peer_id, room_id)
        
        logger.info(f"Peer {peer_id} disconnected")

    async def get_peer(self, peer_id: str) -> Optional[PeerInfo]:
        return self.peers.get(peer_id)

    async def peer_exists(self, peer_id: str) -> bool:
        return peer_id in self.peers

    # ============== Track Management ==============
    async def add_track(self, peer_id: str, track: MediaStreamTrack) -> str:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        transceiver = peer_info.pc.addTransceiver(track, direction="sendrecv")
        sender = transceiver.sender
        
        track_info = TrackInfo(
            track_id=str(uuid.uuid4()),
            kind=track.kind,
            peer_id=peer_id,
            track=track,
            sender=sender
        )
        peer_info.tracks.append(track_info)
        peer_info.senders.append(sender)
        
        logger.info(f"Track {track_info.track_id} added to {peer_id}")
        return track_info.track_id

    async def remove_track(self, peer_id: str, track_id: str):
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return
        
        for i, track_info in enumerate(peer_info.tracks):
            if track_info.track_id == track_id:
                if track_info.track:
                    track_info.track.stop()
                del peer_info.tracks[i]
                break

    async def enable_track(self, peer_id: str, track_id: str, enabled: bool):
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return
        
        for track_info in peer_info.tracks:
            if track_info.track_id == track_id:
                track_info.enabled = enabled
                if track_info.track and hasattr(track_info.track, "enabled"):
                    track_info.track.enabled = enabled
                break

    # ============== Get Tracks from Helper Store ==============
    async def get_tracks(self, peer_id: str) -> List[TrackInfo]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        return peer_info.tracks

    async def get_tracks_by_kind(self, peer_id: str, kind: str) -> List[TrackInfo]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        return [t for t in peer_info.tracks if t.kind == kind]

    async def get_video_tracks(self, peer_id: str) -> List[TrackInfo]:
        return await self.get_tracks_by_kind(peer_id, "video")

    async def get_audio_tracks(self, peer_id: str) -> List[TrackInfo]:
        return await self.get_tracks_by_kind(peer_id, "audio")

    async def has_tracks(self, peer_id: str) -> bool:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return False
        return len(peer_info.tracks) > 0

    async def get_track(self, peer_id: str, track_id: str) -> Optional[TrackInfo]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return None
        for track in peer_info.tracks:
            if track.track_id == track_id:
                return track
        return None

    async def get_senders(self, peer_id: str) -> List[Any]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        return peer_info.senders

    # ============== Get Tracks from RTCPeerConnection ==============
    async def get_pc_senders(self, peer_id: str) -> List:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        return peer_info.pc.getSenders()

    async def get_pc_receivers(self, peer_id: str) -> List:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        return peer_info.pc.getReceivers()

    async def get_pc_transceivers(self, peer_id: str) -> List:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        return peer_info.pc.getTransceivers()

    async def get_pc_track_info(self, peer_id: str) -> List[Dict]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return []
        
        pc = peer_info.pc
        tracks_info = []
        
        for transceiver in pc.getTransceivers():
            info = {
                "mid": transceiver.mid,
                "direction": transceiver.direction,
                "current_direction": transceiver.currentDirection,
            }
            
            if transceiver.sender and transceiver.sender.track:
                info["sender_kind"] = transceiver.sender.track.kind
                info["sender_track_id"] = id(transceiver.sender.track)
                info["sender_enabled"] = transceiver.sender.track.enabled if hasattr(transceiver.sender.track, "enabled") else None
            
            if transceiver.receiver and transceiver.receiver.track:
                info["receiver_kind"] = transceiver.receiver.track.kind
                info["receiver_track_id"] = id(transceiver.receiver.track)
                info["receiver_enabled"] = transceiver.receiver.track.enabled if hasattr(transceiver.receiver.track, "enabled") else None
            
            tracks_info.append(info)
        
        return tracks_info

    async def get_pc_stats(self, peer_id: str) -> Dict:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return {}
        
        pc = peer_info.pc
        
        try:
            stats = await pc.getStats()
            return {
                "timestamp": time.time(),
                "stats": [
                    {
                        "type": stat.type,
                        "timestamp": stat.timestamp,
                        "bytes_sent": getattr(stat, "bytesSent", None),
                        "bytes_received": getattr(stat, "bytesReceived", None),
                        "packets_sent": getattr(stat, "packetsSent", None),
                        "packets_received": getattr(stat, "packetsReceived", None),
                        "packets_lost": getattr(stat, "packetsLost", None),
                        "round_trip_time": getattr(stat, "roundTripTime", None),
                        "frames_per_second": getattr(stat, "framesPerSecond", None),
                        "frame_width": getattr(stat, "frameWidth", None),
                        "frame_height": getattr(stat, "frameHeight", None),
                    }
                    for stat in stats.values()
                ]
            }
        except Exception as e:
            return {"error": str(e)}

    # ============== Signaling ==============
    async def create_offer(self, peer_id: str) -> Dict[str, str]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        pc = peer_info.pc
        
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        if peer_id in self._ice_events:
            try:
                await asyncio.wait_for(
                    self._ice_events[peer_id].wait(),
                    timeout=self.config.ice_timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.warning(f"ICE gathering timeout for {peer_id}")
        
        return {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        }

    async def create_offer_trickle(self, peer_id: str, callback: Callable):
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        pc = peer_info.pc
        
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        initial_offer = {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type,
            "complete": False
        }
        await callback(initial_offer)
        
        @pc.on("icecandidate")
        async def on_ice_candidate(candidate):
            if candidate:
                await callback({
                    "type": "ice_candidate",
                    "candidate": candidate,
                    "complete": False
                })
            else:
                await callback({
                    "type": "ice_complete",
                    "complete": True
                })
        
        return initial_offer

    async def handle_offer(self, peer_id: str, sdp: str) -> Dict[str, str]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        if not SDPValidator.validate_sdp(sdp):
            raise ValueError("Invalid SDP format")
        
        offer = RTCSessionDescription(sdp=sdp, type="offer")
        await peer_info.pc.setRemoteDescription(offer)
        
        answer = await peer_info.pc.createAnswer()
        await peer_info.pc.setLocalDescription(answer)
        
        if peer_id in self._ice_events:
            try:
                await asyncio.wait_for(
                    self._ice_events[peer_id].wait(),
                    timeout=self.config.ice_timeout_seconds
                )
            except asyncio.TimeoutError:
                logger.warning(f"ICE gathering timeout for {peer_id}")
        
        return {
            "sdp": peer_info.pc.localDescription.sdp,
            "type": peer_info.pc.localDescription.type
        }

    async def handle_answer(self, peer_id: str, sdp: str):
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        if not SDPValidator.validate_sdp(sdp):
            raise ValueError("Invalid SDP format")
        
        answer = RTCSessionDescription(sdp=sdp, type="answer")
        await peer_info.pc.setRemoteDescription(answer)

    async def add_ice_candidate(self, peer_id: str, candidate: Dict):
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        try:
            await peer_info.pc.addIceCandidate(candidate)
        except Exception as e:
            logger.warning(f"Failed to add ICE candidate for {peer_id}: {e}")

    async def update_heartbeat(self, peer_id: str):
        peer = self.peers.get(peer_id)
        if peer:
            peer.last_heartbeat = time.time()

    # ============== Renegotiation ==============
    async def renegotiate(self, peer_id: str) -> Dict[str, str]:
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            raise ValueError(f"Peer {peer_id} not found")
        
        offer = await peer_info.pc.createOffer()
        await peer_info.pc.setLocalDescription(offer)
        
        if peer_id in self._ice_events:
            await asyncio.wait_for(
                self._ice_events[peer_id].wait(),
                timeout=self.config.ice_timeout_seconds
            )
        
        return {
            "sdp": peer_info.pc.localDescription.sdp,
            "type": peer_info.pc.localDescription.type,
            "renegotiation": True
        }

    # ============== Internal ==============
    async def _close_peer(self, peer_id: str):
        peer_info = self.peers.get(peer_id)
        if not peer_info:
            return
        
        try:
            for track_info in peer_info.tracks:
                if track_info.track:
                    try:
                        track_info.track.stop()
                    except:
                        pass
            
            await peer_info.pc.close()
        except Exception as e:
            logger.warning(f"Error closing peer {peer_id}: {e}")

    async def _monitor_connections(self):
        while not self._shutdown_event.is_set():
            try:
                current_time = time.time()
                for peer_id, peer_info in list(self.peers.items()):
                    if current_time - peer_info.last_heartbeat > self.config.heartbeat_timeout_seconds:
                        logger.warning(f"Peer {peer_id} timed out")
                        await self.disconnect_peer(peer_id)
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitor error: {e}")
                await asyncio.sleep(30)

    # ============== Stats ==============
    def get_room_stats(self, room_id: str) -> Dict:
        room = self.rooms.get(room_id)
        if not room:
            return {}
        
        return {
            "room_id": room_id,
            "peer_count": len(room.peers),
            "max_peers": self.config.max_peers_per_room,
            "peers": [
                {
                    "peer_id": pid,
                    "role": p.role.value,
                    "track_count": len(p.tracks),
                    "connected_seconds": int(time.time() - p.connected_at)
                }
                for pid, p in room.peers.items()
            ]
        }

    def get_global_stats(self) -> Dict:
        return {
            "total_rooms": len(self.rooms),
            "total_peers": len(self.peers),
            "max_peers": self.config.max_peers_total,
            "total_tracks": sum(len(p.tracks) for p in self.peers.values())
        }


# ============== Factory ==============
def create_helper(config: Optional[IORTCConfig] = None) -> IORTCFastAPIHelper:
    return IORTCFastAPIHelper(config)