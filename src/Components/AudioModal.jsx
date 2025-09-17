import React, { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";

const AudioModal = ({ peer, isOpen, onClose, hangup_call }) => {
  const audioRef = useRef(null);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    if (!peer || !isOpen) return;

    // 1️⃣ Try to get any existing remote stream immediately
    const existingStream = peer.getRemoteStream();
    console.log("remote_stream:::",existingStream)
    if (existingStream) {
      setStream(existingStream);
      if (audioRef.current) {
        audioRef.current.srcObject = existingStream;
        audioRef.current.play().catch(console.error);
      }
    }

    // 2️⃣ Listen for any new tracks added later
    const handleTrack = (remoteStream) => {
      setStream(remoteStream);
      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream;
        audioRef.current.play().catch(console.error);
      }
    };
    peer.on("track", handleTrack);

    // 3️⃣ Cleanup on modal close
    return () => {
      peer.off?.("track", handleTrack);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.srcObject = null;
      }
      setStream(null);
    };
  }, [peer, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box relative">
        <button
          className="btn btn-sm btn-circle absolute right-2 top-2"
          onClick={onClose}
        >
          <IoClose size={18} />
        </button>

        <h3 className="font-bold text-lg mb-4">Incoming Call</h3>
        <audio ref={audioRef} autoPlay controls className="w-full" />
        <div className="modal-action">
          <button className="btn btn-error" onClick={hangup_call}>
            Hang Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioModal;
