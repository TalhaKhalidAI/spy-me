import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  IconButton,
  Alert
} from '@mui/material';
// Icons removed as they are unused
import { roomApi, peerApi, signalingApi } from '../TestRtc/api';
import { useRoom } from '../TestRtc/query';
import { useQuery } from '@tanstack/react-query';
const wsurl = import.meta.env.VITE_WS_URL
export default function LiveCall() {
  const [roomId, setRoomId] = useState(localStorage.getItem('live_roomId') || '');
  const [peerId, setPeerId] = useState(localStorage.getItem('live_peerId') || '');
  const [shareMode, setShareMode] = useState(localStorage.getItem('live_shareMode') || 'camera_mic');

  const [credentialsSaved, setCredentialsSaved] = useState(
    !!localStorage.getItem('live_roomId') && !!localStorage.getItem('live_peerId')
  );

  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  // Fetch rooms for the dropdown/list (optional, just to show available)
  const roomsQuery = useQuery({
    queryKey: ['live_rooms'],
    queryFn: () => roomApi.list(),
  });

  const roomQuery = useRoom(roomId);

  const getWsUrl = () => {
    // Assuming backend runs on the same hostname, port 5050
    // If your backend URL logic is different, adjust here.
    const host = window.location.hostname;
    const port = 5050;
    const base = wsurl.endsWith('/') ? wsurl.slice(0, -1) : wsurl;
    return `${base}/webrtc/${roomId}/${peerId}`;
  };

  function setupPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add local tracks to PC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    // Handle remote tracks (Server sending other peer's video)
    pc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Trickle ICE to server
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate.toJSON()
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("PC State:", pc.connectionState);
    };

    pcRef.current = pc;
    return pc;
  }

  const connectWebSocket = useCallback(() => {
    if (!roomId || !peerId) return;

    // Cleanup existing WS
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = getWsUrl();
    console.log("Connecting WebSocket to", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    // NO WEBSOCKET FOR SIGNALING - REST API ONLY
    const initCall = async () => {
      try {
        let stream = localStreamRef.current;
        if (!stream) {
          try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
              stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
              localStreamRef.current = stream;
              if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            }
          } catch (err) {
            console.warn("Auto-start camera failed", err);
          }
        }

        const pc = setupPeerConnection();
        pc.addTransceiver('video', { direction: 'sendrecv' });
        pc.addTransceiver('audio', { direction: 'sendrecv' });

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

        // 1. Ensure Peer Exists via API
        try {
          await peerApi.create(roomId, { peer_id: peerId, role: 'both' });
        } catch (e) {
          console.log("Peer exists");
        }

        // 2. Send Offer to API
        console.log("Target Vanilla ICE Offer sent to API!");
        const res = await signalingApi.handleOffer(peerId, pc.localDescription!.sdp);

        // 3. Set Answer
        const answer = new RTCSessionDescription({ type: 'answer', sdp: res.data.sdp });
        await pc.setRemoteDescription(answer);
        
        console.log("Target Connected via API!");
        setIsConnected(true);

      } catch (err) {
        console.error("API Signaling failed:", err);
      }
    };

    initCall();

    ws.onclose = () => {
      console.log("WebSocket disconnected.");
      setIsConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      // Auto reconnect
      if (roomId && peerId) {
        console.log("Reconnecting in 5 seconds...");
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error", err);
    };
  }, [roomId, peerId]);

  useEffect(() => {
    // Save to local storage whenever they change
    localStorage.setItem('live_roomId', roomId);
    localStorage.setItem('live_peerId', peerId);
    localStorage.setItem('live_shareMode', shareMode);
  }, [roomId, peerId, shareMode]);

  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock is active!');
        }
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    };
    requestWakeLock();

    // If we have credentials loaded, auto-connect WS on mount
    if (roomId && peerId) {
      // Grab camera automatically if returning to a saved session
      if (!localStreamRef.current) {
        try {
          if (navigator.mediaDevices) {
            const getMedia = shareMode === 'camera_mic'
              ? (navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia({ video: true, audio: true }) : Promise.reject('getUserMedia not supported'))
              : (navigator.mediaDevices.getDisplayMedia ? navigator.mediaDevices.getDisplayMedia({ video: true, audio: shareMode === 'screen_mic' }) : Promise.reject('getDisplayMedia not supported'));

            getMedia
              .then(stream => {
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
              })
              .catch(err => console.warn("Auto-start media failed on reload", err));
          } else {
            console.warn("navigator.mediaDevices is not available");
          }
        } catch (err) {
          console.warn("Error accessing media devices on reload", err);
        }
      }
      connectWebSocket();
    }
    return () => {
      if (wakeLock) {
        wakeLock.release().then(() => console.log('Wake Lock released.'));
      }
      if (wsRef.current) wsRef.current.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket, roomId, peerId, shareMode]);

  const handleSaveCredentials = async () => {
    // 1. Ask for media permissions NOW while the user is physically present
    console.log("Requesting media permissions...");
    try {
      if (navigator.mediaDevices) {
        const stream = shareMode === 'camera_mic'
          ? await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: shareMode === 'screen_mic' });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } else {
        console.warn("Media devices not supported in this context.");
      }
    } catch (err) {
      console.warn("Failed to get media permissions, proceeding view-only", err);
      alert("Surveillance client is starting in view-only/silent mode because media access was not granted.");
    }

    // 2. Hide UI and start waiting for WebSocket
    setCredentialsSaved(true);
    connectWebSocket();
  };

  return (
    <Box sx={credentialsSaved ? {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      bgcolor: 'black',
      zIndex: 999999, // Cover navbar and sidebar
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    } : {
      p: 3,
      bgcolor: 'white',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>

      {!credentialsSaved ? (
        <Card variant="outlined" sx={{ borderRadius: 2, minWidth: 400, maxWidth: 600 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom align="center">
              Surveillance Client Setup
            </Typography>

            {roomsQuery.isLoading ? (
              <Box display="flex" justifyContent="center" p={3}>
                <Typography color="text.secondary">Fetching available rooms...</Typography>
              </Box>
            ) : !roomsQuery.data?.rooms?.length ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                No rooms are currently active on the server. Please wait for an administrator to create a room and assign a peer ID before setting up the client.
              </Alert>
            ) : (
              <>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Select Room"
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    setPeerId(''); // Reset peer ID when room changes
                  }}
                  margin="normal"
                  SelectProps={{
                    native: true,
                  }}
                >
                  <option value="" disabled>Select a room</option>
                  {roomsQuery.data?.rooms?.map((room: string) => (
                    <option key={room} value={room}>{room}</option>
                  ))}
                </TextField>

                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Select Peer ID"
                  value={peerId}
                  onChange={(e) => setPeerId(e.target.value)}
                  margin="normal"
                  SelectProps={{
                    native: true,
                  }}
                  disabled={!roomId || roomQuery.isLoading}
                >
                  <option value="" disabled>Select a peer</option>
                  {roomQuery.data?.peers?.map((peer) => (
                    <option key={peer.peer_id} value={peer.peer_id}>
                      {peer.peer_id} ({peer.role})
                    </option>
                  ))}
                </TextField>

                {roomId && !roomQuery.isLoading && !roomQuery.data?.peers?.length && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                    No peers available in this room. Wait for admin to create one.
                  </Typography>
                )}

                <TextField
                  select
                  fullWidth
                  size="small"
                  label="What to Share"
                  value={shareMode}
                  onChange={(e) => setShareMode(e.target.value)}
                  margin="normal"
                  SelectProps={{
                    native: true,
                  }}
                >
                  <option value="camera_mic">Camera & Microphone</option>
                  <option value="screen">Screen Only</option>
                  <option value="screen_mic">Screen & Microphone</option>
                </TextField>

                <Button
                  variant="contained"
                  fullWidth
                  sx={{ mt: 3 }}
                  onClick={handleSaveCredentials}
                  disabled={!roomId || !peerId}
                >
                  Start Surveillance Mode
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Box>
          {/* Secret reset area in top right corner */}
          <Box
            onDoubleClick={() => {
              localStorage.removeItem('live_roomId');
              localStorage.removeItem('live_peerId');
              localStorage.removeItem('live_shareMode');
              setCredentialsSaved(false);
              setRoomId('');
              setPeerId('');
              window.location.reload();
            }}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 50,
              height: 50,
              cursor: 'pointer',
              zIndex: 9999999
            }}
          />

          {/* Completely Blank Screen - Surveillance Running in Background */}
          {/* We keep the video element mounted but hidden or tiny for debugging */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: 1, height: 1, opacity: 0.1 }}
          />
        </Box>
      )}
    </Box>
  );
}
