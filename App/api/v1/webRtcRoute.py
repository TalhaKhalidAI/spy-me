# App/api/v1/webRtcRoute.py
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import Optional, List, Dict
import logging

from App.api.dependencies.auth import get_current_user
from App.repository.webrtcRepository import WebRTCRepository
from App.models.webrtcModels import *
from App.core.aioRtcHelper import PeerRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webrtc", tags=["WebRTC"])

# ============== SINGLE REPOSITORY INSTANCE ==============
_repo: WebRTCRepository = None

async def get_repo():
    """Get or create WebRTC repository"""
    global _repo
    if _repo is None:
        _repo = WebRTCRepository()
        await _repo.initialize()
    return _repo


# ============== ROOM ==============

@router.post("/rooms")
async def create_room(
    room_data: RoomCreate,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Create a WebRTC room"""
    try:
        room = await repo.create_room(room_data.room_id, room_data.password)
        return {
            "success": True,
            "room_id": room.room_id,
            "password_protected": room.password is not None,
            "created_at": room.created_at
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/rooms")
async def list_rooms(
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """List all rooms"""
    rooms = await repo.list_rooms()
    stats = await repo.get_global_stats()
    return {
        "rooms": rooms,
        "total": len(rooms),
        "total_peers": stats.get("total_peers", 0)
    }


@router.get("/rooms/{room_id}")
async def get_room(
    room_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Get room details"""
    try:
        room = await repo.get_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found")
        
        return {
            "room_id": room.room_id,
            "peer_count": len(room.peers),
            "created_at": room.created_at,
            "password_protected": room.password is not None,
            "peers": [
                {
                    "peer_id": pid,
                    "role": p.role.value,
                    "track_count": len(p.tracks),
                    "connected_at": p.connected_at
                }
                for pid, p in room.peers.items()
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_room: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/rooms/{room_id}/stats")
async def get_room_stats(
    room_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Get detailed statistics for a room"""
    try:
        stats = await repo.get_room_stats(room_id)
        if not stats:
            raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found")
        return stats
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Delete a room"""
    try:
        await repo.delete_room(room_id)
        return {"success": True, "room_id": room_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============== PEER ==============

@router.post("/rooms/{room_id}/peers")
async def create_peer(
    room_id: str,
    peer_data: PeerCreate,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Create a peer in a room"""
    try:
        peer_id, pc = await repo.create_peer(
            room_id,
            peer_data.peer_id,
            peer_data.role,
            peer_data.password
        )
        return {
            "success": True,
            "peer_id": peer_id,
            "room_id": room_id,
            "role": peer_data.role.value
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/peers/{peer_id}")
async def get_peer(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Get peer details"""
    try:
        peer = await repo.get_peer_info(peer_id)
        if not peer:
            raise HTTPException(status_code=404, detail=f"Peer '{peer_id}' not found")
        return peer
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/peers/{peer_id}")
async def disconnect_peer(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Disconnect a peer"""
    try:
        await repo.disconnect_peer(peer_id)
        return {"success": True, "peer_id": peer_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============== PEER HEARTBEAT ==============

@router.post("/peers/{peer_id}/heartbeat")
async def update_peer_heartbeat(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Update peer heartbeat timestamp"""
    try:
        await repo.update_heartbeat(peer_id)
        return {"success": True, "peer_id": peer_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============== PEER STATS ==============

@router.get("/peers/{peer_id}/stats")
async def get_peer_stats(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Get WebRTC statistics for a peer"""
    try:
        stats = await repo.get_peer_stats(peer_id)
        if not stats:
            raise HTTPException(status_code=404, detail=f"Peer '{peer_id}' not found or no stats")
        return {"peer_id": peer_id, "stats": stats}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============== RENEGOTIATION ==============

# In webRtcRoute.py

@router.post("/peers/{peer_id}/renegotiate")
async def renegotiate_peer(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Renegotiate connection with a peer"""
    try:
        result = await repo.renegotiate(peer_id)
        return {"success": True, **result}
    except ValueError as e:
        # ✅ Handle validation errors properly
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # ✅ Handle unexpected errors
        logger.error(f"Unexpected error in renegotiate: {e}")
        raise HTTPException(status_code=500, detail=f"Renegotiation failed: {str(e)}")


# ============== TRACK ==============

@router.get("/peers/{peer_id}/tracks")
async def get_peer_tracks(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Get all tracks for a peer"""
    try:
        tracks = await repo.get_peer_tracks(peer_id)
        return {
            "peer_id": peer_id,
            "tracks": tracks,
            "count": len(tracks)
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/peers/{peer_id}/tracks/{track_id}/enable")
async def enable_track(
    peer_id: str,
    track_id: str,
    enabled: bool = True,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Enable or disable a track"""
    try:
        await repo.enable_track(peer_id, track_id, enabled)
        return {"success": True, "peer_id": peer_id, "track_id": track_id, "enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/peers/{peer_id}/tracks/{track_id}")
async def remove_track(
    peer_id: str,
    track_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Remove a track"""
    try:
        await repo.remove_track(peer_id, track_id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============== SIGNALING ==============

@router.post("/peers/{peer_id}/offer")
async def create_offer(
    peer_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Create an SDP offer"""
    try:
        offer = await repo.create_offer(peer_id)
        return {"success": True, **offer}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/peers/{peer_id}/offer/handle")
async def handle_offer(
    peer_id: str,
    request: SDPRequest,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Handle an SDP offer and return answer"""
    try:
        answer = await repo.handle_offer(peer_id, request.sdp)
        return {"success": True, **answer}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/peers/{peer_id}/answer")
async def handle_answer(
    peer_id: str,
    request: SDPRequest,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Handle an SDP answer"""
    try:
        await repo.handle_answer(peer_id, request.sdp)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/peers/{peer_id}/ice")
async def add_ice_candidate(
    peer_id: str,
    request: ICECandidateRequest,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Add an ICE candidate"""
    try:
        await repo.add_ice_candidate(peer_id, request.candidate)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============== AUTO CONNECT ==============

@router.post("/connect")
async def auto_connect_peers(
    request: OfferRequest,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Auto-connect two peers"""
    result = await repo.auto_connect(request.peer_a_id, request.target_peer_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ============== CONNECTION STATUS ==============

@router.get("/peers/{peer_a_id}/connected/{peer_b_id}")
async def check_connection_status(
    peer_a_id: str,
    peer_b_id: str,
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Check if two peers are connected"""
    result = await repo.check_connection_status(peer_a_id, peer_b_id)
    return result


# ============== STATS ==============

@router.get("/stats")
async def get_stats(
    current_user: dict = Depends(get_current_user),
    repo: WebRTCRepository = Depends(get_repo)
):
    """Get global WebRTC statistics"""
    return await repo.get_global_stats()


# ============== SHUTDOWN ==============
async def shutdown_webrtc():
    """Shutdown WebRTC repository"""
    global _repo
    if _repo:
        await _repo.shutdown()
        _repo = None