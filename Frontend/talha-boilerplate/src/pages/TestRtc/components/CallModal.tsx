import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton
} from '@mui/material';
import {
  Call as CallIcon,
  CallEnd as CallEndIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon
} from '@mui/icons-material';
import { useCallState, useEndCall, useRejectCall } from '../query';
import { signalingApi } from '../api';

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  peerId: string;
}

export function CallModal({ isOpen, onClose, peerId }: CallModalProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Poll call state from backend ONLY when modal is open
  const { data: callStateData } = useCallState(peerId, isOpen);
  const endCallMutation = useEndCall();
  const rejectCallMutation = useRejectCall();
  
  const callState = callStateData?.data?.state || 'idle';

  // Initialize media devices
  useEffect(() => {
    if (isOpen) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((stream) => {
              setLocalStream(stream);
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
              }
            })
            .catch(err => {
              console.warn("Failed to get local media, proceeding view-only", err);
            });
        } else {
          console.warn("getUserMedia not supported. Proceeding view-only.");
        }
      } catch (err) {
        console.warn("Error accessing media devices", err);
      }
    } else {
      // Cleanup streams when closed
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setTimeout(() => setLocalStream(null), 0);
      }
      if (pcRef.current) {
        pcRef.current.close();
        setTimeout(() => setRemoteStream(null), 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = isMicMuted);
      setIsMicMuted(!isMicMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = isVideoMuted);
      setIsVideoMuted(!isVideoMuted);
    }
  };

  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await signalingApi.addIce(peerId, event.candidate.toJSON());
        } catch {
          console.error("Failed to send ICE");
        }
      }
    };

    pcRef.current = pc;
    return pc;
  };

  const handleStartCall = async () => {
    const pc = setupPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Send offer to backend
      const response = await signalingApi.handleOffer(peerId, JSON.stringify(offer));
      const answer = response.data.sdp;
      if (answer) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer as any)));
      }
    } catch (e) {
      console.error("Call failed", e);
    }
  };

  const handleAcceptCall = async () => {
    setupPeerConnection();
    try {
      // In a real app, you would fetch the pending offer from the backend here.
      // Since the backend might not have a GET /pending-offer endpoint, we assume 
      // the backend can handle us sending an Answer directly if we know the offer,
      // but typically we need the offer SDP first.
      
      // Pseudo-logic to simulate accepting:
      // await pc.setRemoteDescription(offerSDP);
      // const answer = await pc.createAnswer();
      // await pc.setLocalDescription(answer);
      // await signalingApi.handleAnswer(peerId, JSON.stringify(answer));
      console.log("Accepting call logic goes here once backend provides the offer.");
    } catch (e) {
      console.error("Accept failed", e);
    }
  };

  const handleReject = () => {
    rejectCallMutation.mutate(peerId);
  };

  const handleHangup = () => {
    endCallMutation.mutate(peerId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={() => {}} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Live Call - {peerId}</Typography>
          <Typography variant="subtitle2" color="primary">
            Status: {callState.toUpperCase()}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        <Box display="flex" gap={2} height={400}>
          {/* Local Video */}
          <Box flex={1} bgcolor="black" position="relative" borderRadius={2} overflow="hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <Typography
              position="absolute"
              bottom={8}
              left={8}
              color="white"
              bgcolor="rgba(0,0,0,0.5)"
              px={1}
              borderRadius={1}
            >
              You
            </Typography>
          </Box>
          
          {/* Remote Video */}
          <Box flex={1} bgcolor="black" position="relative" borderRadius={2} overflow="hidden" display="flex" alignItems="center" justifyContent="center">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Typography color="white">Waiting for video...</Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ justifyContent: 'center', p: 3, gap: 2 }}>
        <IconButton onClick={toggleMic} color={isMicMuted ? "error" : "primary"} sx={{ border: '1px solid' }}>
          {isMicMuted ? <MicOffIcon /> : <MicIcon />}
        </IconButton>
        
        <IconButton onClick={toggleVideo} color={isVideoMuted ? "error" : "primary"} sx={{ border: '1px solid' }}>
          {isVideoMuted ? <VideocamOffIcon /> : <VideocamIcon />}
        </IconButton>

        {callState === 'idle' && (
          <Button variant="contained" color="primary" startIcon={<CallIcon />} onClick={handleStartCall}>
            Start Call
          </Button>
        )}

        {callState === 'incoming_call' && (
          <>
            <Button variant="contained" color="success" startIcon={<CallIcon />} onClick={handleAcceptCall}>
              Accept
            </Button>
            <Button variant="contained" color="error" startIcon={<CallEndIcon />} onClick={handleReject}>
              Reject
            </Button>
          </>
        )}

        {['active', 'calling', 'have-local-offer'].includes(callState) && (
          <Button variant="contained" color="error" startIcon={<CallEndIcon />} onClick={handleHangup}>
            Hang Up
          </Button>
        )}
        
        <Button variant="outlined" color="inherit" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
