import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';

interface ActiveCallViewerProps {
  roomId: string;
  targetPeer: string;
}
const wsurl=import.meta.env.VITE_WS_URL
export function ActiveCallViewer({ roomId, targetPeer }: ActiveCallViewerProps) {
  const [status, setStatus] = useState<string>('Initializing...');
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Generate a temporary admin peer ID for this connection
    const adminPeerId = `admin_${Math.floor(Math.random() * 10000)}`;
    
    // Connect WebSocket
    const host = window.location.hostname;
    const port = 5050; // Use same port as LiveCall
    const url = `${wsurl}/webrtc/${roomId}/${adminPeerId}`;
    
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('Signaling Connected. Starting Call...');
      
      // Initialize PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Handle incoming tracks
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus('Live');
        }
      };

      // Trickle ICE
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'ice_candidate',
            target_peer: targetPeer,
            candidate: event.candidate.toJSON()
          }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('Live');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('Disconnected');
        }
      };

      // Tell the server to create an offer for us to connect
      ws.send(JSON.stringify({
        type: 'create_offer',
        target_peer: targetPeer
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === "offer_created" && pcRef.current) {
          // Server generated an offer for us
          setStatus('Negotiating...');
          const offer = new RTCSessionDescription({ type: 'offer', sdp: msg.sdp });
          await pcRef.current.setRemoteDescription(offer);
          
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          
          ws.send(JSON.stringify({
            type: 'handle_answer',
            sdp: answer.sdp
          }));
        }

        if (msg.type === "ice_candidate" && pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        }

      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };

    ws.onclose = () => {
      setStatus('Signaling Disconnected');
    };

    return () => {
      if (pcRef.current) pcRef.current.close();
      if (wsRef.current) wsRef.current.close();
    };
  }, [roomId, targetPeer]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" color="secondary">
          Live Feed: {targetPeer}
        </Typography>
        <Typography variant="caption" color={status === 'Live' ? 'success.main' : 'text.secondary'}>
          {status}
        </Typography>
      </Box>
      
      <Box 
        bgcolor="black" 
        borderRadius={1} 
        overflow="hidden" 
        display="flex" 
        alignItems="center" 
        justifyContent="center"
        height={200}
        position="relative"
      >
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {status !== 'Live' && (
          <Box position="absolute" display="flex" flexDirection="column" alignItems="center">
            <CircularProgress size={24} color="inherit" sx={{ mb: 1, color: 'white' }} />
            <Typography variant="caption" color="white">Connecting...</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
