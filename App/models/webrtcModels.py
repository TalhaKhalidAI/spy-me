# App/models/webrtcModels.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class PeerRole(str, Enum):
    PUBLISHER = "publisher"
    SUBSCRIBER = "subscriber"
    BOTH = "both"


class TrackKind(str, Enum):
    AUDIO = "audio"
    VIDEO = "video"


# ============== ROOM MODELS ==============
class RoomCreate(BaseModel):
    room_id: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    password: Optional[str] = Field(None, min_length=4, max_length=50)


class RoomUpdate(BaseModel):
    password: Optional[str] = Field(None, min_length=4, max_length=50)


class RoomResponse(BaseModel):
    room_id: str
    peer_count: int
    created_at: datetime
    password_protected: bool
    peers: Optional[List[Dict[str, Any]]] = None


# ============== PEER MODELS ==============
class PeerCreate(BaseModel):
    peer_id: Optional[str] = None
    role: PeerRole = PeerRole.BOTH
    password: Optional[str] = None


class PeerResponse(BaseModel):
    peer_id: str
    room_id: str
    role: str
    track_count: int
    connected_at: datetime


# ============== TRACK MODELS ==============
class TrackCreate(BaseModel):
    kind: TrackKind


class TrackResponse(BaseModel):
    track_id: str
    kind: str
    peer_id: str
    enabled: bool


# ============== SIGNALING MODELS ==============
class SDPRequest(BaseModel):
    sdp: str
    sdp_type: str = "offer"


class SDPResponse(BaseModel):
    sdp: str
    sdp_type: str
    success: bool = True


class ICECandidateRequest(BaseModel):
    candidate: Dict[str, Any]


class OfferRequest(BaseModel):
    peer_a_id: str
    target_peer_id: str


# ============== STATS MODELS ==============
class StatsResponse(BaseModel):
    total_rooms: int
    total_peers: int
    total_tracks: int
    max_peers: int
    rooms: Optional[List[Dict]] = None