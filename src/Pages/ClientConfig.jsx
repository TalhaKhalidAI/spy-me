import React, { useState, useEffect, useRef } from "react";
import { notifyUser } from "../Helper/WindowsNotification";
import WebRTCManager from "../Helper/WebRTCManager";
import { toast } from "react-toastify";
import { getClients, updateAnswer } from "../Helper/Requests";
let  baseURL=import.meta.env.VITE_API_URL

const ClientConfig = () => {
  const localStreamRef = useRef(null);   // <-- ADD THIS
  const mediaReleasedRef = useRef(false);

  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(
    localStorage.getItem("selectedClientId") || ""
  );
  const [activeClientId, setActiveClientId] = useState(null); // <-- active peer
  const [cd, Scd] = useState();
  const peerRef = useRef(null);
  const lastSdpRef = useRef(null);
  const creatingPeerRef = useRef(false);
  const autoAnsweringRef = useRef(false);

const stopMediaTracks = () => {
  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    console.log("Mic/Camera released ✅");
  }
};
  const createPeerForUser = () => {
    if (creatingPeerRef.current) return;
    creatingPeerRef.current = true;

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current.destroy?.();
      peerRef.current = null;
    }

    const newPeer = new WebRTCManager();
    newPeer.createPeer(true);
    peerRef.current = newPeer;

    toast.success("Peer created successfully!");
    creatingPeerRef.current = false;
  };

  const deletePeerForUser = () => {
    if (peerRef.current) {
      try {
        peerRef.current.close();
        peerRef.current.destroy?.();
        peerRef.current = null;
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    }
    stopMediaTracks()
    return false;
  };


  const fetchClients = async () => {
    try {
      const clientList = await getClients();
      const temp = await Promise.all(
        clientList.client_ids.map((cid) => getClients(cid))
      );
      setClients(temp);

      if (!selectedClient) return;

      const clientObj = temp.find((c) => Object.keys(c)[0] === selectedClient);
      if (!clientObj) {
        // client removed
        toast.warn("Selected client removed.");
        setSelectedClient("");
        Scd(null);
        deletePeerForUser();
        setActiveClientId(null);
        localStorage.removeItem("selectedClientId");
        return;
      }

      const clientData = clientObj[selectedClient];

      // Create peer only if activeClientId is different
      if (activeClientId !== selectedClient) {
        createPeerForUser();
        setActiveClientId(selectedClient);
      }

      // Auto-answer
      const localState = peerRef.current?.getStatus()?.peerConnectionState;
      if (
        clientData.sdp &&
        clientData.ice?.length > 0 &&
        localState !== "connected" &&
        localState !== "connecting" &&
        !autoAnsweringRef.current &&
        lastSdpRef.current !== clientData.sdp
      ) {
        lastSdpRef.current = clientData.sdp;
        Scd(clientData);
        handleAutoAnswer(clientData);
      }
    } catch (err) {
      console.error("Failed to fetch clients:", err);
    }
  };

  // useEffect(() => {
  //   fetchClients();
  // }, []);

  // Auto peer status check every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchClients();
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedClient, activeClientId]);

  const handleAutoAnswer = async (clientDetails) => {
    if (!peerRef.current || autoAnsweringRef.current) return;

    autoAnsweringRef.current = true;

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStreamRef.current=localStream
      const ans = await peerRef.current.createAnswer(
        { type: "offer", sdp: clientDetails.sdp },
        clientDetails.ice,
        localStream
      );

      const aid = peerRef.current.iceCandidates;
   const res = await updateAnswer({
    client_id: clientDetails.id || selectedClient,
    answer_sdp: ans.sdp,
    ice: aid,
});

      if (res.status === 200) {
        notifyUser(
          "Auto Answer",
          `Connected to ${selectedClient}`,
          "/server.png"
        );
        toast.success(`Connected to ${selectedClient}`);
      }
    } catch (err) {
      console.error("Error auto-answering:", err);
    } finally {
      
      autoAnsweringRef.current = false;
    }
  };
useEffect(() => {
  if (!selectedClient) return;

  const evtSource = new EventSource(`${baseURL}/get_clients?id=${selectedClient}`);

  evtSource.onmessage = (event) => {
    console.log("SSE message received:", event.data); // <-- log this
    const clientData = JSON.parse(event.data);
    Scd(clientData);

    if (!peerRef.current) createPeerForUser();

    const localState = peerRef.current?.getStatus()?.peerConnectionState;
    if (localState !== "connected" && localState !== "connecting") {
           
      if (lastSdpRef.current !== clientData.sdp) {
        console.log("New SDP detected, triggering auto-answer");
        lastSdpRef.current = clientData.sdp;
        handleAutoAnswer(clientData);
      }
      
    }
  if (
    localState === "not-created" ||
    localState === "disconnected" ||
    localState === "failed" ||
    localState === "closed"
  ) {
    if (!mediaReleasedRef.current) {
      stopMediaTracks();
      mediaReleasedRef.current = true; // mark released
    }
  } else {
    // reset when back to active states
    mediaReleasedRef.current = false;
  }
  };

  return () => evtSource.close();
}, [selectedClient]);



  //---------------- UI ----------------
  if (selectedClient) return null;
git 
  return (
    <div className="p-4 max-w-md mx-auto">
      <h3 className="mb-2 font-semibold">Select Client</h3>
      {clients.length === 0 ? (
        <p className="text-gray-500">Waiting for clients from admin panel...</p>
      ) : (
        <select
          className="select select-bordered w-full mb-4"
          value={selectedClient}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedClient(id);
            localStorage.setItem("selectedClientId", id);

            const clientObj = clients.find((c) => Object.keys(c)[0] === id);
            if (clientObj) Scd(clientObj[id]);

            // DO NOT create peer here — handled by effect/fetch
          }}
        >
          <option value="" disabled>
            -- Select a Client --
          </option>
          {clients.map((c, idx) => {
            const id = Object.keys(c)[0];
            return (
              <option key={idx} value={id}>
                {id}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
};

export default ClientConfig;
