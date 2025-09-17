import { useState, useEffect, useRef, useCallback } from "react";
import WebRTCManager from "./WebRTCManager"; // your class

let instanceCounter = 0;

export function useWebRTCManager() {
  const [id] = useState(() => ++instanceCounter); // unique ID per hook instance
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerState, setPeerState] = useState({
    peerConnectionState: "not-created",
    iceConnectionState: "not-created",
    dataChannelState: "not-created",
    videoActive: false,
    audioActive: false,
  });
  const [dataMessages, setDataMessages] = useState([]);

  const managerRef = useRef(null);

  // Initialize WebRTCManager
  const initManager = useCallback(async () => {
    if (managerRef.current) return;

    const manager = new WebRTCManager();
    managerRef.current = manager;

    // Handle events
    manager.on("track", (stream) => setRemoteStream(stream));
    manager.on("connection-state", () => setPeerState(manager.getStatus()));
    manager.on("data-message", (msg) => setDataMessages((prev) => [...prev, msg]));
    manager.on("data-open", () => setPeerState(manager.getStatus()));
    manager.on("data-close", () => setPeerState(manager.getStatus()));

    // Get local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      manager.addStream(stream);
    } catch (err) {
      console.error("Error accessing media devices", err);
    }

    manager.createPeer(true); // create peer and data channel
    setPeerState(manager.getStatus());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    initManager();

    return () => {
      if (managerRef.current) {
        managerRef.current.close();
        managerRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [initManager, localStream]);

  // API exposed to component
  const createOffer = useCallback(async (remoteICE = []) => {
    if (!managerRef.current) return null;
    return await managerRef.current.createOffer(remoteICE);
  }, []);

  const createAnswer = useCallback(async (remoteOffer, remoteICE = []) => {
    if (!managerRef.current) return null;
    return await managerRef.current.createAnswer(remoteOffer, remoteICE);
  }, []);

  const addIceCandidate = useCallback(async (candidate) => {
    if (!managerRef.current) return;
    await managerRef.current.addIceCandidate(candidate);
  }, []);

  const sendData = useCallback((data) => {
    if (!managerRef.current) return;
    try {
      managerRef.current.send(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  return {
    id,
    manager: managerRef.current,
    localStream,
    remoteStream,
    peerState,
    dataMessages,
    createOffer,
    createAnswer,
    addIceCandidate,
    sendData,
  };
}
