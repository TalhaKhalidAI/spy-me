import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  IconButton
} from '@mui/material';
import {
  Sensors as SensorsIcon,
  Call as CallIcon,
  CallEnd as CallEndIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon
} from '@mui/icons-material';
import { peerApi, signalingApi } from '../api';

interface SignalingPanelProps {
  selectedPeer: string; // Used as Admin Peer ID
  setSelectedPeer: (peer: string) => void;
}
const wsurl = import.meta.env.VITE_WS_URL
export function SignalingPanel({ selectedPeer, setSelectedPeer }: SignalingPanelProps) {
  const [roomId, setRoomId] = useState('room1');
  const [targetPeer, setTargetPeer] = useState('');

  const [isConnected, setIsConnected] = useState(false);
  const [callActive, setCallActive] = useState(false);

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const getWsUrl = () => {
    const base = wsurl.endsWith('/') ? wsurl.slice(0, -1) : wsurl;
    return `${base}/webrtc/${roomId}/${selectedPeer}`;
  };

  const connectWebSocket = useCallback(() => {
    if (!roomId || !selectedPeer) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      console.log("Admin WS Connected");
      setIsConnected(true);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 10000);
    };

    ws.onclose = () => {
      console.log("Admin WS Disconnected");
      setIsConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("Admin WS Received:", msg.type, msg);

        if (msg.type === "offer_created" && pcRef.current) {
          // Server generated an offer for us (because we sent create_offer)
          console.log("Received server offer, generating answer...");
          const offer = new RTCSessionDescription({ type: 'offer', sdp: msg.sdp });
          await pcRef.current.setRemoteDescription(offer);

          pendingCandidates.current.forEach(async (c) => {
            try { await pcRef.current!.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { }
          });
          pendingCandidates.current = [];

          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);

          ws.send(JSON.stringify({
            type: 'handle_answer',
            sdp: answer.sdp
          }));

          setCallActive(true);
        }

        if (msg.type === "answer_created" && pcRef.current) {
          // Server answered our offer
          const answer = new RTCSessionDescription({ type: 'answer', sdp: msg.sdp });
          await pcRef.current.setRemoteDescription(answer);

          pendingCandidates.current.forEach(async (c) => {
            try { await pcRef.current!.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { }
          });
          pendingCandidates.current = [];

          setCallActive(true);
        }

        if (msg.type === "ice_candidate" && pcRef.current) {
          if (pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } else {
            pendingCandidates.current.push(msg.candidate);
          }
        }

      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    wsRef.current = ws;
  }, [roomId, selectedPeer]);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pcRef.current) pcRef.current.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, []);

  function setupPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate.toJSON()
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setCallActive(false);
      }
    };

    pcRef.current = pc;
    return pc;
  }

  const handleStartSurveillance = async () => {
    if (!isConnected || !wsRef.current || !targetPeer) {
      alert("Please connect WS and enter target peer first.");
      return;
    }

    try {
      // Get admin media (optional, but good for full two-way test)
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        } else {
          console.warn("getUserMedia not supported (might be insecure context). Proceeding view-only.");
        }
      } catch (mediaErr) {
        console.warn("Could not get local media. Proceeding as view-only.", mediaErr);
      }

      setupPeerConnection();

      // Tell Server to create an offer for us and forward to target peer!
      wsRef.current.send(JSON.stringify({
        type: 'create_offer',
        target_peer: targetPeer
      }));

    } catch (e) {
      console.error("Failed to start surveillance", e);
      alert("Could not start surveillance. Check console for details.");
    }
  };

  const endCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallActive(false);
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
    <Grid container spacing={3}>
      {/* Configuration */}
      <Grid item xs={12} md={4}>
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
              <SensorsIcon color="primary" /> Admin WebSocket Setup
            </Typography>

            <Box mt={2}>
              <TextField
                label="Room ID"
                fullWidth
                size="small"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                margin="normal"
              />
              <TextField
                label="Your Admin Peer ID"
                fullWidth
                size="small"
                value={selectedPeer}
                onChange={(e) => setSelectedPeer(e.target.value)}
                margin="normal"
              />

              <Button
                variant="contained"
                fullWidth
                sx={{ mt: 2 }}
                onClick={connectWebSocket}
                disabled={!roomId || !selectedPeer}
              >
                Connect Admin WS
              </Button>

              <Box mt={2}>
                {isConnected ? (
                  <Alert severity="success">Admin WS Connected</Alert>
                ) : (
                  <Alert severity="warning">Admin WS Disconnected</Alert>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Surveillance Controls */}
      <Grid item xs={12} md={8}>
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Surveillance Viewer</Typography>

            <Box display="flex" gap={2} mb={2}>
              <TextField
                label="Target Client Peer ID"
                size="small"
                value={targetPeer}
                onChange={(e) => setTargetPeer(e.target.value)}
                sx={{ flexGrow: 1 }}
              />

              {!callActive ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<CallIcon />}
                  onClick={handleStartSurveillance}
                  disabled={!isConnected || !targetPeer}
                >
                  Start Surveillance
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<CallEndIcon />}
                  onClick={endCall}
                >
                  Stop Viewing
                </Button>
              )}
            </Box>

            {/* Video Layout */}
            <Box display="flex" gap={2} height={400} bgcolor="black" borderRadius={2} overflow="hidden">
              <Box flex={1} position="relative" borderRight="1px solid #333">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <Typography position="absolute" bottom={8} left={8} color="white" bgcolor="rgba(0,0,0,0.5)" px={1} borderRadius={1}>Admin View</Typography>
                {callActive && (
                  <Box position="absolute" bottom={8} right={8} display="flex" gap={1}>
                    <IconButton onClick={toggleMic} color={isMicMuted ? "error" : "primary"} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.8)' }}>
                      {isMicMuted ? <MicOffIcon /> : <MicIcon />}
                    </IconButton>
                    <IconButton onClick={toggleVideo} color={isVideoMuted ? "error" : "primary"} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.8)' }}>
                      {isVideoMuted ? <VideocamOffIcon /> : <VideocamIcon />}
                    </IconButton>
                  </Box>
                )}
              </Box>

              <Box flex={1} position="relative" display="flex" alignItems="center" justifyContent="center">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {!callActive && <Typography color="white">Target Stream Awaiting...</Typography>}
                {callActive && <Typography position="absolute" bottom={8} left={8} color="white" bgcolor="rgba(0,0,0,0.5)" px={1} borderRadius={1}>Target View</Typography>}
              </Box>
            </Box>

          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}