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
      await wsRef.current.emitPromise('joinRoom', { roomId: targetRoomId });
    },
    []
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

      const ws = new WebSocketClient({
        url: import.meta.env.VITE_WS_URL || window.location.origin,
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
            console.warn('📷 Admin requested to toggle camera.');
            eventHandlers.current.toggleCamera(payload?.enabled);
            break;
          case 'toggleMic':
            console.warn('🎤 Admin requested to toggle mic.');
            eventHandlers.current.toggleMic(payload?.enabled);
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
    <div className="container mx-auto p-4 max-w-lg mt-12">
      <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">📹 SFU Client</h1>
          <p className="text-base-content/60 text-sm mt-1">Select a room to start broadcasting</p>
          <div className="mt-2">
            <span className={`badge ${wsConnected ? 'badge-success' : 'badge-error'} badge-sm gap-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {wsConnected ? 'Server Connected' : 'Server Disconnected'}
            </span>
          </div>
        </div>

        <div className="form-control w-full space-y-4">
          <div>
            <label className="label">
              <span className="label-text font-semibold">Available Rooms</span>
              <button className="label-text-alt btn btn-ghost btn-xs" onClick={fetchRooms} disabled={isLoadingRooms}>
                {isLoadingRooms ? 'Refreshing...' : '🔄 Refresh'}
              </button>
            </label>

            {isLoadingRooms ? (
              <div className="flex justify-center p-4"><span className="loading loading-spinner"></span></div>
            ) : availableRooms.length === 0 ? (
              <div className="alert alert-warning text-sm">
                <span>No rooms available. Please create a room on the server first.</span>
              </div>
            ) : (
              <select
                className="select select-bordered w-full"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value="" disabled>Select a room to join</option>
                {availableRooms.map((room) => (
                  <option key={room.roomId || room.id || room.room_id} value={room.roomId || room.id || room.room_id}>
                    {room.roomId || room.id || room.room_id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            className="btn btn-primary w-full"
            onClick={() => establishDevice(roomId)}
            disabled={!wsConnected || isLoadingCall || !roomId}
          >
            {isLoadingCall ? (
              <span className="loading loading-spinner"></span>
            ) : (
              '🚀 Start Broadcasting'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SfuTestPage;