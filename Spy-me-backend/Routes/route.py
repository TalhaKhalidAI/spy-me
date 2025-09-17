from tkinter import NO
from token import OP
from fastapi import APIRouter, HTTPException,Query,Path
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import  Dict,Optional
import time
from Model.Model import HeartbeatData,SDPRegisterRequest,SDPAnswerRequest,SDPAnswerUpdateRequest,SDPUpdateRequest
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    print("API Start 007")
    yield
    print("API End 007")

route = APIRouter(lifespan=lifespan)
spy_clients: Dict[str, Dict] = {}


@route.post("/register_sdp", tags=["SDP-manager"])
async def register_sdp(data: SDPRegisterRequest):
    try:
        if data.client_id in spy_clients:
            raise HTTPException(status_code=409, detail="User already exists")
        spy_clients[data.client_id] = {
            "sdp": data.sdp,
            "status": "disconnected",
            "last_heartbeat": time.time(),
            "ice":data.ice
        }
        return JSONResponse(content={"message": "SDP and ICE candidates registered successfully", "client_id": data.client_id})
    except HTTPException:
        # Re-raise HTTP exceptions to be handled properly by FastAPI
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error occurred while registering SDP: {e}")
    
    
@route.post("/register_answer", tags=["SDP-manager"])
async def register_answer(data: SDPAnswerRequest):
    client = spy_clients.get(data.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found. Register offer first.")
    
    client["answer_sdp"] = data.answer_sdp
    client["answer_ice"]=data.ice
    client["last_heartbeat"] = time.time()
    client["status"] = "disconnected"

    return JSONResponse(content={"message": "Answer SDP registered successfully", "client_id": data.client_id})

@route.get("/get_clients", tags=["SDP-manager"])
async def get_clients(id: Optional[str] = Query(None)):
    if id:
        client = spy_clients.get(id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        return {id: client}
    else:
        # Return only list of client IDs
        return {"client_ids": list(spy_clients.keys())}

@route.put("/update_sdp", tags=["SDP-manager"])
async def update_sdp(data: SDPUpdateRequest):
    client = spy_clients.get(data.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client["ice"]=data.ice
    client["sdp"] = data.sdp
    client["last_heartbeat"] = time.time()
    # client["status"] = "disconnected"

    return {"message": "SDP offer updated successfully", "client_id": data.client_id}

@route.put("/update_answer", tags=["SDP-manager"])
async def update_answer(data: SDPAnswerUpdateRequest):
    client = spy_clients.get(data.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client["answer_ice"]=data.ice
    client["answer_sdp"] = data.answer_sdp
    client["last_heartbeat"] = time.time()
    # client["status"] = "disconnected"

    return {"message": "SDP answer updated successfully", "client_id": data.client_id}

@route.delete("/delete_client/{client_id}", tags=["SDP-manager"])
async def delete_client(client_id: str = Path(..., description="ID of the client to delete")):
    if client_id not in spy_clients:
        raise HTTPException(status_code=404, detail="Client not found")

    del spy_clients[client_id]
    return {"message": f"Client '{client_id}' deleted successfully"}

from fastapi import Body

@route.post("/heartbeat", tags=["SDP-manager"])
async def heartbeat(
    client_id: str = Body(..., embed=True),
    status: str = Body(..., embed=True)  # could be "connected", "disconnected", etc.
):
    client = spy_clients.get(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    client["last_heartbeat"] = time.time()
    client["status"] = status
    return {"message": f"Heartbeat updated for {client_id}", "status": status}
