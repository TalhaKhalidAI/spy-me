import React, { useEffect, useState, useRef, useCallback } from 'react';
import { sfuApi } from '../SfuTest/sfu.api';
import { WebSocketClient } from '../../utils/websocket';
import { Device } from 'mediasoup-client';
import { ToastMsgs } from '@/api/toastUtils';

const getIceServers = () => {
  try {
    if (import.meta.env.VITE_ICE_SERVERS) {
      return JSON.parse(import.meta.env.VITE_ICE_SERVERS);
    }
  } catch (e) {
    console.error('Failed to parse VITE_ICE_SERVERS env variable', e);
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];
};

interface Props { }

const SfuTestPage = (_props: Props) => {
  // ─── State ──────────────────────────────────────────────────
  const [roomId, setRoomId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  const [device, setDevice] = useState<Device | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [sendTransport, setSendTransport] = useState<any>(null);
  const [producers, setProducers] = useState<any[]>([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isLoadingCall, setIsLoadingCall] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocketClient | null>(null);
  const isAutoConnecting = useRef(false);

  // Use a ref to store latest event handlers to avoid stale closures in ws.on callbacks
  const eventHandlers = useRef<any>({
    establishDevice: (roomId: string) => { },
    leaveCall: (userInitiated: boolean) => { }
  });

  // ─── Fetch Rooms ──────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    setIsLoadingRooms(true);
    try {
      const data = await sfuApi.getRooms();
      let rooms: any[] = [];
      if (Array.isArray(data)) rooms = data;
      else if ((data as any).rooms) rooms = (data as any).rooms;
      else if ((data as any).data) rooms = (data as any).data;
      setAvailableRooms(rooms);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      setAvailableRooms([]);
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // ─── Polling Heartbeat (Detect Kicks) ─────────────────────
  useEffect(() => {
    let interval: any;
    if (isCallActive && wsConnected && wsRef.current) {
      interval = setInterval(async () => {
        const savedRoom = localStorage.getItem('sfuClientRoom');
        if (!savedRoom || !wsRef.current?.isConnected) return;

        try {
          const response = await sfuApi.getRoomProducers(savedRoom);
          const producersList = Array.isArray(response)
            ? response
            : (response as any).producers || (response as any).data || [];

          const myId = wsRef.current.id;
          if (myId && producersList) {
            const amIProducing = producersList.some((p: any) =>
              p.socketId === myId || producers.some(localP => localP.id === p.id || localP.id === p.producerId)
            );
            // If we have local producers but the server says we don't, we were kicked
            if (!amIProducing && producers.length > 0) {
              console.warn('⚠️ Polling detected our producer was dropped! Reconnecting...');
              wsRef.current.disconnect();
              setTimeout(() => {
                if (wsRef.current) wsRef.current.connect();
              }, 1500);
            }
          }
        } catch (err) {
          // ignore network errors during polling
        }
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [isCallActive, wsConnected, producers]);

  // ─── Get RTP Capabilities ──────────────────────────────
  const getRtpCap = useCallback(async () => {
    if (wsRef.current && wsRef.current.isConnected) {
      try {
        const res = await wsRef.current.getRouterRtpCapabilities();
        if (res && !res.error) return res;
      } catch (error) {
        console.warn('⚠️ WebSocket getRouterRtpCapabilities failed:', error);
      }
    }
    try {
      const response = await fetch('/api/v1/sfu/capabilities');
      const data = await response.json();
      if (data.status === 'success') return data.data.capabilities;
    } catch (error) {
      console.error('❌ All methods failed to get RTP capabilities:', error);
    }
    return null;
  }, []);

  // ─── Transport & Producer ───────────────────────────────
  const makeTransportSend = useCallback(
    async (targetRoomId: string) => {
      if (!wsRef.current || !wsRef.current.isConnected) return null;
      try {
        const res = await wsRef.current.createSendTransport(targetRoomId);
        if (res && !(res as any).error) return res;
        throw new Error((res as any)?.error || 'Failed to create send transport');
      } catch (error) {
        console.warn('⚠️ Create Send Transport failed:', error);
        throw error;
      }
    },
    []
  );

  const ConnectTransport = useCallback(
    async (transportId: string, dtlsParameters: any) => {
      if (!wsRef.current || !wsRef.current.isConnected) return null;
      try {
        return await wsRef.current.emitPromise('connectTransport', {
          transportId,
          dtlsParameters,
        });
      } catch (error) {
        console.error('❌ connectTransport failed:', error);
        throw error;
      }
    },
    []
  );

  const Producers = useCallback(
    async (transportId: string, kind: 'audio' | 'video', rtpParameters: any) => {
      if (!wsRef.current || !wsRef.current.isConnected) return null;
      try {
        return await wsRef.current.emitPromise('produce', {
          transportId,
          kind,
          rtpParameters,
          source: 'camera',
        });
      } catch (error) {
        console.error('❌ Produce failed:', error);
        throw error;
      }
    },
    []
  );

  const CloseProducer = useCallback(
    async (producerId: string) => {
      if (!wsRef.current || !wsRef.current.isConnected) return null;
      try {
        return await wsRef.current.emitPromise('closeProducer', { producerId });
      } catch (error) {
        console.error('❌ Failed to close producer:', error);
        return null;
      }
    },
    []
  );

  const joinRoom = useCallback(
    async (targetRoomId: string) => {
      if (!wsRef.current || !wsRef.current.isConnected) throw new Error('WebSocket not connected');
      await wsRef.current.emitPromise('joinRoom', { roomId: targetRoomId, clientName });
    },
    [clientName]
  );

  // ─── Leave Call ──────────────────────────────────────────
  const leaveCall = useCallback(async (userInitiated: boolean = false) => {
    try {
      if (wsRef.current && wsRef.current.isConnected) {
        for (const p of producers) {
          await CloseProducer(p.id).catch(() => { });
        }
      }

      for (const p of producers) {
        try { if (p.producer) p.producer.close(); } catch (e) { }
      }
      setProducers([]);

      if (sendTransport) {
        try { sendTransport.close(); } catch (e) { }
        setSendTransport(null);
      }

      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        setLocalStream(null);
      }

      setDevice(null);
      setIsCallActive(false);

      if (userInitiated) {
        localStorage.removeItem('sfuClientRoom');
        if (wsRef.current) {
          wsRef.current.disconnect();
          setTimeout(() => {
            if (wsRef.current) wsRef.current.connect();
          }, 500);
        }
      }
    } catch (error) {
      console.error('❌ Error leaving call:', error);
    }
  }, [producers, sendTransport, localStream, CloseProducer]);

  // ─── Establish Device ────────────────────────────────────
  const establishDevice = useCallback(async (targetRoomId: string) => {
    setIsLoadingCall(true);
    try {
      if (!wsRef.current || !wsRef.current.isConnected) throw new Error('WebSocket not connected');

      const rcap = await getRtpCap();
      if (!rcap) throw new Error('Failed to get RTP capabilities');

      const dev = new Device();
      await dev.load({ routerRtpCapabilities: rcap });
      setDevice(dev);

      await joinRoom(targetRoomId);

      const transportData = await makeTransportSend(targetRoomId);
      if (!transportData) throw new Error('Failed to create send transport');

      const sendTransportObj = dev.createSendTransport({
        id: transportData.id,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
        iceServers: getIceServers()
      });

      sendTransportObj.on('connect', ({ dtlsParameters }, callback, errback) => {
        ConnectTransport(sendTransportObj.id, dtlsParameters)
          .then(() => callback())
          .catch((err) => errback(err));
      });

      sendTransportObj.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const result = await Producers(sendTransportObj.id, kind, rtpParameters);
          if (result?.producerId) callback({ id: result.producerId });
          else errback(new Error('Failed to create producer'));
        } catch (error: any) {
          errback(error);
        }
      });

      const storedVideo = localStorage.getItem('sfuClientVideoEnabled');
      const isVideoEnabled = storedVideo === null ? true : storedVideo === 'true';
      const storedAudio = localStorage.getItem('sfuClientAudioEnabled');
      const isAudioEnabled = storedAudio === null ? true : storedAudio === 'true';

      const constraints: any = {};
      if (isVideoEnabled) constraints.video = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
      if (isAudioEnabled) constraints.audio = true;

      let media: MediaStream | null = null;
      if (constraints.audio || constraints.video) {
        try {
          media = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.warn('⚠️ Media devices failed to start or permissions denied', err);
        }
      }

      const videoTrack = media?.getVideoTracks()[0];
      const audioTrack = media?.getAudioTracks()[0];

      if (media) setLocalStream(media);

      const createdProducers: any[] = [];
      if (audioTrack) {
        const audioProducer = await sendTransportObj.produce({
          track: audioTrack,
          encodings: [{ maxBitrate: 64000 }],
          codecOptions: { opusStereo: true, opusFec: true, opusDtx: true },
        });
        createdProducers.push({ id: audioProducer.id, kind: 'audio', producer: audioProducer });
      }

      if (videoTrack) {
        const videoProducer = await sendTransportObj.produce({
          track: videoTrack,
          encodings: [{ maxBitrate: 100000 }, { maxBitrate: 300000 }, { maxBitrate: 900000 }],
        });
        createdProducers.push({ id: videoProducer.id, kind: 'video', producer: videoProducer });
      }

      setProducers(createdProducers);
      setSendTransport(sendTransportObj);
      setIsCallActive(true);
      localStorage.setItem('sfuClientRoom', targetRoomId);
      setRoomId(targetRoomId);

    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      await leaveCall(false);

      if (err.message?.toLowerCase().includes('router for room') || err.message?.toLowerCase().includes('not found')) {
        console.warn('Room missing on server. Stopping auto-reconnect.');
        localStorage.removeItem('sfuClientRoom');
        setRoomId('');
        return;
      }

      // Auto-retry if a room is saved
      const savedRoom = localStorage.getItem('sfuClientRoom');
      if (savedRoom) {
        console.log('🔄 Retrying connection in 3s via WS reset...');
        setTimeout(() => {
          if (wsRef.current) {
            wsRef.current.disconnect();
            setTimeout(() => {
              if (wsRef.current) wsRef.current.connect();
            }, 500);
          }
        }, 3000);
      }
    } finally {
      setIsLoadingCall(false);
      isAutoConnecting.current = false;
    }
  }, [getRtpCap, joinRoom, makeTransportSend, ConnectTransport, Producers, leaveCall]);

  // Keep eventHandlers ref up-to-date
  useEffect(() => {
    const handleHardware = async (kind: 'video' | 'audio', enable: boolean) => {
      const prodObj = producers.find(p => p.producer && p.producer.kind === kind);
      let producer = prodObj?.producer;

      if (enable) {
        if (kind === 'video') localStorage.setItem('sfuClientVideoEnabled', 'true');
        if (kind === 'audio') localStorage.setItem('sfuClientAudioEnabled', 'true');

        // TURN ON: Request new hardware access
        try {
          const constraints = kind === 'video'
            ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }
            : { audio: true };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const newTrack = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];

          if (newTrack) {
            if (producer) {
              await producer.replaceTrack({ track: newTrack });
              producer.resume();
              if (wsRef.current?.isConnected) {
                try { await wsRef.current.emitPromise('resumeProducer', { producerId: producer.id }); } catch (e) { }
              }
            } else if (sendTransport) {
              // Create a new producer dynamically if it didn't exist
              const newProducer = await sendTransport.produce({
                track: newTrack,
                encodings: kind === 'video'
                  ? [{ maxBitrate: 100000 }, { maxBitrate: 300000 }, { maxBitrate: 900000 }]
                  : [{ maxBitrate: 64000 }],
                codecOptions: kind === 'audio' ? { opusStereo: true, opusFec: true, opusDtx: true } : undefined,
              });
              setProducers(prev => [...prev, { id: newProducer.id, kind, producer: newProducer }]);
              producer = newProducer;
            }

            // Update localStream
            if (localStream) {
              const oldTrack = kind === 'video' ? localStream.getVideoTracks()[0] : localStream.getAudioTracks()[0];
              if (oldTrack) {
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
              }
              localStream.addTrack(newTrack);
            } else {
              setLocalStream(stream);
            }
          }
        } catch (err) {
          console.error(`Failed to start ${kind} hardware:`, err);
        }
      } else {
        if (kind === 'video') localStorage.setItem('sfuClientVideoEnabled', 'false');
        if (kind === 'audio') localStorage.setItem('sfuClientAudioEnabled', 'false');

        // TURN OFF: Physically kill hardware
        if (producer) {
          producer.pause();
          if (wsRef.current?.isConnected) {
            try { await wsRef.current.emitPromise('pauseProducer', { producerId: producer.id }); } catch (e) { }
          }
          // Optional but extremely effective: replace track with null to detach it from WebRTC
          try { await producer.replaceTrack({ track: null }); } catch (e) { }
        }

        if (localStream) {
          const tracks = kind === 'video' ? localStream.getVideoTracks() : localStream.getAudioTracks();
          tracks.forEach(t => {
            t.stop(); // ⚡ This physically turns off the camera light / mic ⚡
            localStream.removeTrack(t);
          });
        }
      }
    };

    eventHandlers.current = {
      establishDevice,
      leaveCall,
      toggleCamera: (enabled?: boolean) => {
        const prod = producers.find(p => p.producer && p.producer.kind === 'video')?.producer;
        const isCurrentlyOff = prod ? prod.paused : true;
        const targetState = enabled !== undefined ? enabled : isCurrentlyOff;
        handleHardware('video', !!targetState);
      },
      toggleMic: (enabled?: boolean) => {
        const prod = producers.find(p => p.producer && p.producer.kind === 'audio')?.producer;
        const isCurrentlyOff = prod ? prod.paused : true;
        const targetState = enabled !== undefined ? enabled : isCurrentlyOff;
        handleHardware('audio', !!targetState);
      },
      muteAudio: () => handleHardware('audio', false),
      unmuteAudio: () => handleHardware('audio', true),
      stopVideo: () => handleHardware('video', false),
      startVideo: () => handleHardware('video', true)
    };
  }, [establishDevice, leaveCall, localStream, producers, sendTransport]);

  // ─── WebSocket Connection ──────────────────────────────
  const makeWsConn = useCallback(async () => {
    try {
      if (wsRef.current?.connected) return;

      const searchParams = new URLSearchParams(window.location.search);
      const urlToken = searchParams.get('token') || '';

      const ws = new WebSocketClient({
        url: import.meta.env.VITE_WS_URL || window.location.origin,
        token: urlToken,
        autoConnect: true,
        reconnectionAttempts: 9999, // keep trying infinitely
        reconnectionDelay: 2000,
      });

      wsRef.current = ws;

      ws.on('connect', () => {
        setWsConnected(true);
        // Auto-reconnect if local storage has a room
        const savedRoom = localStorage.getItem('sfuClientRoom');
        if (savedRoom && !isAutoConnecting.current) {
          isAutoConnecting.current = true;
          setRoomId(savedRoom);
          // Small delay to ensure server is fully ready
          setTimeout(() => eventHandlers.current.establishDevice(savedRoom), 1500);
        }
      });

      ws.on('disconnect', () => {
        setWsConnected(false);
        isAutoConnecting.current = false;
        // Tear down local state so it's fresh for next connect
        eventHandlers.current.leaveCall(false);
      });

      // If server force closes a producer (drop call remotely), interpret as end call
      ws.on('producerClosed', (data: any) => {
        console.warn('⚠️ Server force-closed producer:', data.producerId);

        // We must only disconnect if it's OUR producer being closed
        // Because ws.on handlers might not have the latest producers closure, 
        // we can check local storage or let the polling mechanism handle the drop.
        // Actually, since producers is empty in the closure, we shouldn't indiscriminately disconnect.
        // The polling loop above will catch if we were kicked out.
      });

      // ─── Remote Commands from Admin ──────────────────────────
      ws.on('executeCommand', (data: any) => {
        console.log('⚡ Received remote command from Admin:', data);
        const { command, payload } = data;

        switch (command) {
          case 'refreshPage':
          case 'refresh':
            console.warn('🔄 Admin requested a page refresh. Reloading now...');
            window.location.reload();
            break;
          case 'closeTab':
          case 'close_tab':
            console.warn('❌ Admin requested to close the tab.');
            window.close();
            // Fallback for browsers that block window.close(): navigate to a blank page
            setTimeout(() => {
              window.location.href = 'about:blank';
            }, 500);
            break;
          case 'toggleCamera':
            console.warn('📷 Admin requested to toggle camera. Ignoring payload to force local state check.');
            eventHandlers.current.toggleCamera(); // Ignore payload to force dumb toggle
            break;
          case 'toggleMic':
            console.warn('🎤 Admin requested to toggle mic. Ignoring payload to force local state check.');
            eventHandlers.current.toggleMic(); // Ignore payload to force dumb toggle
            break;
          case 'muteAudio':
            console.warn('🔇 Admin requested to mute audio.');
            eventHandlers.current.muteAudio();
            break;
          case 'unmuteAudio':
            console.warn('🔊 Admin requested to unmute audio.');
            eventHandlers.current.unmuteAudio();
            break;
          case 'stopVideo':
          case 'drop_video':
            console.warn('🎥 Admin requested to stop video feed.');
            eventHandlers.current.stopVideo();
            break;
          case 'startVideo':
            console.warn('🎥 Admin requested to start video feed.');
            eventHandlers.current.startVideo();
            break;
          default:
            console.log('Unknown command:', command);
        }
      });

    } catch (err: any) {
      setWsConnected(false);
    }
  }, [establishDevice, leaveCall]);

  useEffect(() => {
    makeWsConn();
    return () => {
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a room is saved in localStorage, we consider the app "auto-connecting" and hide the dropdown
  const savedRoom = localStorage.getItem('sfuClientRoom');
  if (savedRoom || isCallActive) {
    // Stealth mode: completely blank white screen
    return <div className="min-h-screen w-full bg-white fixed top-0 left-0 z-50"></div>;
  }

  // ─── Render Room Selection ──────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-600/20 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] rounded-3xl p-8 transition-all duration-500 hover:border-white/[0.12]">
          
          <div className="text-center mb-10">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-fuchsia-500 blur-lg opacity-60 animate-pulse"></div>
              <div className="relative bg-[#111] border border-white/10 rounded-2xl w-20 h-20 flex items-center justify-center shadow-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="url(#gradient)" className="w-10 h-10">
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#d946ef" />
                    </linearGradient>
                  </defs>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>
            
            <h1 className="text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500">
              Nexus<span className="text-indigo-500">Cast</span>
            </h1>
            <p className="text-gray-400 mt-3 text-sm font-medium tracking-wide">Enter the high-fidelity broadcast zone</p>
            
            <div className="mt-6 inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/40 border border-white/5 shadow-inner">
              <div className="relative flex h-2.5 w-2.5">
                {wsConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${wsConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'}`}></span>
              </div>
              <span className={`text-xs font-bold uppercase tracking-wider ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                {wsConnected ? 'Uplink Established' : 'No Signal'}
              </span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="form-control relative">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Select Node</span>
                <button 
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider flex items-center gap-1 group" 
                  onClick={fetchRooms} 
                  disabled={isLoadingRooms}
                >
                  {isLoadingRooms ? (
                     <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-hover:rotate-180 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Sync
                    </>
                  )}
                </button>
              </div>

              {isLoadingRooms ? (
                <div className="h-14 flex items-center justify-center bg-black/40 rounded-xl border border-white/10">
                  <span className="loading loading-bars loading-sm text-indigo-500"></span>
                </div>
              ) : availableRooms.length === 0 ? (
                <div className="h-14 flex items-center justify-center bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  No active nodes detected.
                </div>
              ) : (
                <div className="relative">
                  <select
                    className="w-full h-14 bg-black/50 text-white border border-white/10 rounded-xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    <option value="" disabled className="bg-gray-900">Configure connection target...</option>
                    {availableRooms.map((room) => (
                      <option key={room.roomId || room.id || room.room_id} value={room.roomId || room.id || room.room_id} className="bg-gray-900 py-2">
                        {room.roomId || room.id || room.room_id}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="form-control relative">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Client Name</span>
              </div>
              <input 
                type="text" 
                placeholder="Enter your name" 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)}
                className="w-full h-14 bg-black/50 text-white border border-white/10 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium"
              />
            </div>

            <button
              className={`relative group w-full h-14 rounded-xl font-bold text-white uppercase tracking-widest overflow-hidden transition-all duration-300 ${!wsConnected || isLoadingCall || !roomId || !clientName ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10' : 'border border-indigo-500/50 hover:border-indigo-400'}`}
              onClick={() => establishDevice(roomId)}
              disabled={!wsConnected || isLoadingCall || !roomId || !clientName}
            >
              {wsConnected && roomId && clientName && !isLoadingCall && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-fuchsia-600 opacity-80 group-hover:opacity-100 transition-opacity"></div>
              )}
              
              <div className="relative flex items-center justify-center z-10 w-full h-full">
                {isLoadingCall ? (
                  <span className="loading loading-dots loading-md text-white"></span>
                ) : (
                  <>
                    <span className={!wsConnected || !roomId ? 'opacity-50' : ''}>Initialize Broadcast</span>
                    {wsConnected && roomId && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </>
                )}
              </div>
            </button>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-600 font-mono">End-to-End Encrypted WebRTC Stream</p>
        </div>
      </div>
    </div>
  );

};

export default SfuTestPage;
