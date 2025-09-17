from tkinter import NO
from token import OP
from fastapi import APIRouter, HTTPException,Query,Path
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import  Dict,Optional
import time
from Model.Model import HeartbeatData,SDPRegisterRequest,SDPAnswerRequest,SDPAnswerUpdateRequest,SDPUpdateRequest
from contextlib import asynccontextmanager
import json
import os
from dotenv import load_dotenv
import asyncio
load_dotenv()
conf_path=''

@asynccontextmanager
async def lifespan(app):
    global conf_path

    conf_path=os.getenv("STORE_CONF_PATH")
    if not conf_path:
        raise ValueError(""" ERROR!!! `STORE_CONF_PATH` not available on env""")
 
    print("API Start 007")
    yield
    print("API End 007")

route = APIRouter(lifespan=lifespan)
spy_clients: Dict[str, Dict] = {}


@route.post("/register_sdp", tags=["SDP-manager"])
async def register_sdp(data: SDPRegisterRequest):
    try:
        # Check if client already in memory
        if data.client_id in spy_clients:
            raise HTTPException(status_code=409, detail="User already exists")
        spy_clients[data.client_id] = {
            "sdp": data.sdp,
            "status": "disconnected",
            "last_heartbeat": time.time(),
            "ice": data.ice
        }

        # Path for this client file
        fname = f"{data.client_id}.json"
        fpath = os.path.join(conf_path, fname)

        # Save new or update existing
        with open(fpath, "w") as f:
            json.dump(spy_clients[data.client_id], f, indent=2)

        return JSONResponse(
            content={
                "message": "SDP and ICE candidates registered successfully",
                "client_id": data.client_id,
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error occurred while registering SDP: {e}"
        )
    
    
@route.post("/register_answer", tags=["SDP-manager"])
async def register_answer(data: SDPAnswerRequest):
    client = spy_clients.get(data.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found. Register offer first.")
    
    client["answer_sdp"] = data.answer_sdp
    client["answer_ice"]=data.ice
    client["last_heartbeat"] = time.time()
    client["status"] = "disconnected"
    # Path for this client file
    fname = f"{data.client_id}.json"
    fpath = os.path.join(conf_path, fname)
    # Save new or update existing
    with open(fpath, "w") as f:
        json.dump(spy_clients[data.client_id], f, indent=2)

    return JSONResponse(content={"message": "Answer SDP registered successfully", "client_id": data.client_id})

@route.get("/get_clients", tags=["SDP-manager"])
async def get_clients(id: Optional[str] = Query(None)):
    # --- Step 1: sync files -> memory ---
    for fname in os.listdir(conf_path):
        if fname.endswith(".json"):
            client_id = fname.replace(".json", "")
            if client_id not in spy_clients:
                with open(os.path.join(conf_path, fname)) as f:
                    spy_clients[client_id] = json.load(f)

    # --- Step 2: sync memory -> files ---
    for client_id, data in spy_clients.items():
        fpath = os.path.join(conf_path, f"{client_id}.json")
        if not os.path.exists(fpath):
            with open(fpath, "w") as f:
                json.dump(data, f, indent=2)

    # --- Step 3: return response ---
    if id:
        client = spy_clients.get(id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        return {id: client}
    else:
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
    # Path for this client file
    fname = f"{data.client_id}.json"
    fpath = os.path.join(conf_path, fname)
    # Save new or update existing
    with open(fpath, "w") as f:
        json.dump(spy_clients[data.client_id], f, indent=2)
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
    # Path for this client file
    fname = f"{data.client_id}.json"
    fpath = os.path.join(conf_path, fname)
    # Save new or update existing
    with open(fpath, "w") as f:
        json.dump(spy_clients[data.client_id], f, indent=2)
    return {"message": "SDP answer updated successfully", "client_id": data.client_id}

@route.delete("/delete_client/{client_id}", tags=["SDP-manager"])
async def delete_client(client_id: str = Path(..., description="ID of the client to delete")):
    if client_id not in spy_clients:
        raise HTTPException(status_code=404, detail="Client not found")
    cfname = os.path.join(conf_path, f"{client_id}.json")
    if os.path.exists(cfname):
        os.remove(cfname)
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
