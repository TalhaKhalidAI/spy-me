import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, IconButton } from '@mui/material';
import { Mic, MicOff, Videocam, VideocamOff, Close } from '@mui/icons-material';
import { peerApi, signalingApi } from '../api';

interface CallViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  targetPeerId: string;
}

export function CallViewerModal({ isOpen, onClose, roomId, targetPeerId }: CallViewerModalProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const wsurl = import.meta.env.VITE_WS_URL
  useEffect(() => {
    if (isOpen && roomId && targetPeerId) {
      startSurveillance();
    }
    return () => {
      endCall();
    };
  }, [isOpen, roomId, targetPeerId]);

  const endCall = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    setIsConnected(false);
  };

  const startSurveillance = async () => {
    try {
      // 1. Get Admin Media (optional)
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        } else {
          console.warn("getUserMedia not supported. Proceeding view-only.");
        }
      } catch (mediaErr) {
        console.warn("Could not get local media. Proceeding view-only.", mediaErr);
      }

      // 2. Setup PC (No WebSocket for Signaling)
      const adminId = `admin_${Math.floor(Math.random() * 10000)}`;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
      } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }, 3000);
        }
      });

      // API calls
      try {
        await peerApi.create(roomId, { peer_id: adminId, role: 'both' });
      } catch (e) {
        console.log("Peer exists");
      }

      const res = await signalingApi.handleOffer(adminId, pc.localDescription!.sdp);
      const answer = new RTCSessionDescription({ type: 'answer', sdp: res.data.sdp });
      await pc.setRemoteDescription(answer);
      
      console.log("Admin Connected via API!");
      setIsConnected(true);

    } catch (err) {
      console.error("Failed to start surveillance", err);
      alert("An error occurred while connecting to surveillance.");
      onClose();
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = isMicMuted);
      setIsMicMuted(!isMicMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = isVideoMuted);
      setIsVideoMuted(!isVideoMuted);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Live Surveillance: {targetPeerId}</Typography>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, bgcolor: 'black' }}>
        <Box display="flex" gap={1} p={1} height={500}>
          <Box flex={1} position="relative" borderRight="1px solid #333">
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <Typography position="absolute" bottom={8} left={8} color="white" bgcolor="rgba(0,0,0,0.5)" px={1}>Admin View</Typography>
            <Box position="absolute" bottom={8} right={8} display="flex" gap={1}>
              <IconButton onClick={toggleMic} color={isMicMuted ? "error" : "primary"} sx={{ bgcolor: 'rgba(255,255,255,0.8)' }}>
                {isMicMuted ? <MicOff /> : <Mic />}
              </IconButton>
              <IconButton onClick={toggleVideo} color={isVideoMuted ? "error" : "primary"} sx={{ bgcolor: 'rgba(255,255,255,0.8)' }}>
                {isVideoMuted ? <VideocamOff /> : <Videocam />}
              </IconButton>
            </Box>
          </Box>
          <Box flex={1} position="relative" display="flex" alignItems="center" justifyContent="center">
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <Typography position="absolute" bottom={8} left={8} color="white" bgcolor="rgba(0,0,0,0.5)" px={1}>Target View</Typography>
            {!isConnected && <Typography color="white">Connecting to target...</Typography>}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="error" variant="contained">Hang Up</Button>
      </DialogActions>
    </Dialog>
  );
}
