import React, { useEffect, useState, useRef, useCallback } from 'react';
import { sfuApi } from '../SfuTest/sfu.api';
import { WebSocketClient } from '../../utils/websocket';
import { Device } from 'mediasoup-client';
import { ToastMsgs } from '@/api/toastUtils';

interface Props {}

const SfuTestPage = (_props: Props) => {
  // ─── State ──────────────────────────────────────────────────
  const [roomId, setRoomId] = useState<string>('talha-room');
  const [device, setDevice] = useState<Device | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [sendTransport, setSendTransport] = useState<any>(null);
  const [recvTransport, setRecvTransport] = useState<any>(null);
  const [producers, setProducers] = useState<any[]>([]);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isLoadingCall, setIsLoadingCall] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocketClient | null>(null);
  const unsubListenersRef = useRef<Array<() => void>>([]);

  // ─── WebSocket Connection ──────────────────────────────
  const makeWsConn = useCallback(async () => {
    try {
      if (wsRef.current?.connected) {
        console.log('✅ WebSocket already connected');
        return;
      }

      const ws = new WebSocketClient({
        url: import.meta.env.VITE_WS_URL || 'ws://localhost:9090',
        autoConnect: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      wsRef.current = ws;

      await new Promise((resolve, reject) => {
        ws.on('connect', () => {
          setWsConnected(true);
          ToastMsgs.success('✅ WebSocket connected');
          resolve(true);
        });
        ws.on('connect_error', (error) => {
          reject(error);
        });
      });
    } catch (err: any) {
      setWsConnected(false);
      ToastMsgs.error(`❌ Error connecting to WS: ${err.message || err}`);
    }
  }, []);

  // ─── Get RTP Capabilities ──────────────────────────────
  const getRtpCap = useCallback(async () => {
    if (wsRef.current && wsConnected) {
      try {
        console.log('📡 Trying WebSocket getRouterRtpCapabilities...');
        const res = await wsRef.current.getRouterRtpCapabilities();
        if (res && !res.error) {
          console.log('✅ WebSocket RTP Capabilities:', res);
          return res;
        }
      } catch (error) {
        console.warn('⚠️ WebSocket failed:', error);
      }
    }

    try {
      console.log('📡 Falling back to HTTP /api/v1/sfu/capabilities...');
      const response = await fetch('/api/v1/sfu/capabilities');
      const data = await response.json();
      if (data.status === 'success') {
        console.log('✅ HTTP RTP Capabilities:', data.data.capabilities);
        return data.data.capabilities;
      }
    } catch (error) {
      console.error('❌ All methods failed:', error);
    }
    return null;
  }, [wsConnected]);

  // ─── Transport Functions ──────────────────────────────────
  const makeTransportSend = useCallback(
    async (targetRoomId: string) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('🚀 Creating send transport for room:', targetRoomId);
        const res = await wsRef.current.createSendTransport(targetRoomId);
        if (res && !res.error) {
          console.log('✅ Send transport created:', res);
          return res;
        }
      } catch (error) {
        console.warn('⚠️ WebSocket failed:', error);
      }
      return null;
    },
    [wsConnected]
  );

  const makeTransportRecv = useCallback(
    async (targetRoomId: string) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('📥 Creating receive transport for room:', targetRoomId);
        const res = await wsRef.current.createRecvTransport(targetRoomId);
        if (res && !res.error) {
          console.log('✅ Receive transport created:', res);
          return res;
        }
      } catch (error) {
        console.warn('⚠️ WebSocket failed:', error);
      }
      return null;
    },
    [wsConnected]
  );

  const ConnectTransport = useCallback(
    async (transportId: string, dtlsParameters: any) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('🔗 Connecting transport:', transportId);
        const response = await wsRef.current.emitPromise('connectTransport', {
          transportId: transportId,
          dtlsParameters: dtlsParameters,
        });
        console.log('✅ Transport connected:', response);
        return response;
      } catch (error) {
        console.error('❌ connectTransport failed:', error);
        throw error;
      }
    },
    [wsConnected]
  );

  // ─── Producer Functions ──────────────────────────────────
  const Producers = useCallback(
    async (
      transportId: string,
      kind: 'audio' | 'video',
      rtpParameters: any,
      source: string = 'camera'
    ) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('📹 Producing:', kind, 'from', source);
        const response = await wsRef.current.emitPromise('produce', {
          transportId: transportId,
          kind: kind,
          rtpParameters: rtpParameters,
          source: source || 'camera',
        });
        console.log('✅ Producer created:', response);
        return response;
      } catch (error) {
        console.error('❌ Produce failed:', error);
        throw error;
      }
    },
    [wsConnected]
  );

  // ─── Consumer Functions ──────────────────────────────────
  const Consumers = useCallback(
    async (transportId: string, producerId: string, rtpCapabilities: any) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('📥 Consuming producer:', producerId);
        const response = await wsRef.current.emitPromise('consume', {
          transportId: transportId,
          producerId: producerId,
          rtpCapabilities: rtpCapabilities,
        });
        console.log('✅ Consumer response:', response);
        return response;
      } catch (error) {
        console.error('❌ Consume failed:', error);
        return null;
      }
    },
    [wsConnected]
  );

  const ResumeConsumer = useCallback(
    async (consumerId: string) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('▶️ Resuming consumer on server:', consumerId);
        const response = await wsRef.current.emitPromise('resumeConsumer', {
          consumerId: consumerId,
        });
        console.log('✅ Server consumer resumed:', consumerId);
        return response;
      } catch (error) {
        console.error('❌ Failed to resume consumer on server:', error);
        return null;
      }
    },
    [wsConnected]
  );

  // ─── Control Functions ──────────────────────────────────
  const CloseProducer = useCallback(
    async (producerId: string) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('🗑️ Closing producer:', producerId);
        const response = await wsRef.current.emitPromise('closeProducer', {
          producerId: producerId,
        });
        console.log('✅ Producer closed:', producerId);
        return response;
      } catch (error) {
        console.error('❌ Failed to close producer:', error);
        return null;
      }
    },
    [wsConnected]
  );

  const CloseConsumer = useCallback(
    async (consumerId: string) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return null;
      }
      try {
        console.log('🗑️ Closing consumer:', consumerId);
        const response = await wsRef.current.emitPromise('closeConsumer', {
          consumerId: consumerId,
        });
        console.log('✅ Consumer closed:', consumerId);
        return response;
      } catch (error) {
        console.error('❌ Failed to close consumer:', error);
        return null;
      }
    },
    [wsConnected]
  );

  const joinRoom = useCallback(
    async (targetRoomId: string) => {
      if (!wsRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return;
      }
      try {
        console.log(`🏠 Joining room: ${targetRoomId}`);
        await wsRef.current.emitPromise('joinRoom', { roomId: targetRoomId });
        ToastMsgs.success(`✅ Joined room: ${targetRoomId}`);
      } catch (error: any) {
        console.error('❌ Failed to join room:', error);
        ToastMsgs.error(`❌ Failed to join room: ${error.message}`);
        throw error;
      }
    },
    [wsConnected]
  );

  // ─── Consume A Single Producer ──────────────────────────
  const consumeProducer = useCallback(
    async (
      recvTransportObj: any,
      dev: Device,
      producerId: string,
      peerSocketId: string,
      kind?: string
    ) => {
      if (!recvTransportObj || !dev) {
        console.warn('⚠️ Receive transport or device not initialized');
        return;
      }

      if (peerSocketId === wsRef.current?.id) {
        console.log('⏭️ Skipping own producer:', producerId);
        return;
      }

      try {
        console.log(`📥 Requesting consume for producer ${producerId} (${kind || 'media'}) from ${peerSocketId}...`);

        const consumerData = await Consumers(
          recvTransportObj.id,
          producerId,
          dev.rtpCapabilities
        );

        if (!consumerData) {
          console.warn('⚠️ No consumer data returned for producer:', producerId);
          return;
        }

        const consumerId = consumerData.consumerId || consumerData.id;
        const rtpParameters = consumerData.rtpParameters;
        const consumerKind = consumerData.kind || kind || 'video';

        const consumer = await recvTransportObj.consume({
          id: consumerId,
          producerId: producerId,
          rtpParameters: rtpParameters,
          kind: consumerKind,
        });

        // 1. Resume client-side mediasoup consumer
        await consumer.resume();

        // 2. Resume server-side mediasoup consumer
        await ResumeConsumer(consumer.id);

        // 3. Attach track to remoteStreams (combine audio + video per peer socketId)
        if (consumer.track) {
          setRemoteStreams((prev) => {
            const newMap = new Map(prev);
            let stream = newMap.get(peerSocketId);
            if (!stream) {
              stream = new MediaStream();
            }
            // Remove existing track of same kind if replacing
            stream
              .getTracks()
              .filter((t) => t.kind === consumer.track.kind)
              .forEach((t) => stream!.removeTrack(t));

            stream.addTrack(consumer.track);
            newMap.set(peerSocketId, stream);
            return newMap;
          });
          console.log(`🎥 Remote ${consumer.track.kind} track added for ${peerSocketId}`);
        }

        setConsumers((prev) => [
          ...prev.filter((c) => c.id !== consumer.id),
          {
            id: consumer.id,
            producerId: producerId,
            consumer,
            socketId: peerSocketId,
            kind: consumerKind,
          },
        ]);

        ToastMsgs.success(`📥 Connected to ${consumerKind} from ${peerSocketId.slice(0, 6)}...`);
      } catch (err: any) {
        console.error('❌ Failed to consume producer:', err);
        ToastMsgs.error(`❌ Failed to consume: ${err.message}`);
      }
    },
    [Consumers, ResumeConsumer]
  );

  // ─── Leave Call ──────────────────────────────────────────
  const leaveCall = useCallback(async () => {
    try {
      // Unsubscribe all socket event listeners
      unsubListenersRef.current.forEach((unsub) => unsub());
      unsubListenersRef.current = [];

      // Close all producers
      for (const p of producers) {
        await CloseProducer(p.id);
      }
      setProducers([]);

      // Close all consumers
      for (const c of consumers) {
        await CloseConsumer(c.id);
      }
      setConsumers([]);

      // Close transports
      if (sendTransport) {
        try {
          sendTransport.close();
        } catch (e) {}
        setSendTransport(null);
      }
      if (recvTransport) {
        try {
          recvTransport.close();
        } catch (e) {}
        setRecvTransport(null);
      }

      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        setLocalStream(null);
      }

      // Clear remote streams
      remoteStreams.forEach((stream) => {
        stream.getTracks().forEach((t) => t.stop());
      });
      setRemoteStreams(new Map());

      setDevice(null);
      setIsCallActive(false);

      ToastMsgs.success('📞 Call ended');
      console.log('✅ Call ended');
    } catch (error) {
      console.error('❌ Error leaving call:', error);
    }
  }, [
    producers,
    consumers,
    sendTransport,
    recvTransport,
    localStream,
    remoteStreams,
    CloseProducer,
    CloseConsumer,
  ]);

  // ─── Establish Device & Join Room ────────────────────────
  const establishDevice = useCallback(async () => {
    setIsLoadingCall(true);
    try {
      // ─── 0️⃣ Check WebSocket connection ─────────────────
      if (!wsRef.current || !wsConnected) {
        ToastMsgs.error('❌ WebSocket not connected');
        return;
      }

      const activeRoomId = roomId.trim() || 'talha-room';

      // ─── 1️⃣ Get RTP Capabilities ────────────────────────
      const rcap = await getRtpCap();
      if (!rcap) {
        ToastMsgs.error('❌ Failed to get RTP capabilities');
        return;
      }

      // ─── 2️⃣ Create & Load Device ────────────────────────
      const dev = new Device();
      await dev.load({ routerRtpCapabilities: rcap });
      setDevice(dev);
      ToastMsgs.success('✅ Device loaded successfully');

      // ─── 3️⃣ Join Room (AWAITED) ──────────────────────────
      await joinRoom(activeRoomId);

      // ─── 4️⃣ Create Transports ────────────────────────────
      // SEND transport
      const transportData = await makeTransportSend(activeRoomId);
      if (!transportData) {
        ToastMsgs.error('❌ Failed to create send transport');
        return;
      }

      const sendTransportObj = dev.createSendTransport({
        id: transportData.id,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      });

      // RECV transport
      const recvTransportData = await makeTransportRecv(activeRoomId);
      if (!recvTransportData) {
        ToastMsgs.error('❌ Failed to create receive transport');
        return;
      }

      const recvTransportObj = dev.createRecvTransport({
        id: recvTransportData.id,
        iceParameters: recvTransportData.iceParameters,
        iceCandidates: recvTransportData.iceCandidates,
        dtlsParameters: recvTransportData.dtlsParameters,
        sctpParameters: recvTransportData.sctpParameters,
      });

      // ─── 5️⃣ Connect SEND Transport ────────────────────────
      sendTransportObj.on('connect', ({ dtlsParameters }, callback, errback) => {
        ConnectTransport(sendTransportObj.id, dtlsParameters)
          .then(() => {
            callback();
            ToastMsgs.success('🔐 Send transport connected!');
          })
          .catch((err) => {
            errback(err);
            ToastMsgs.error(`❌ Send DTLS failed: ${err.message}`);
          });
      });

      // ─── 6️⃣ Connect RECV Transport ────────────────────────
      recvTransportObj.on('connect', ({ dtlsParameters }, callback, errback) => {
        ConnectTransport(recvTransportObj.id, dtlsParameters)
          .then(() => {
            callback();
            ToastMsgs.success('🔐 Recv transport connected!');
          })
          .catch((err) => {
            errback(err);
            ToastMsgs.error(`❌ Recv DTLS failed: ${err.message}`);
          });
      });

      // ─── 7️⃣ Setup Produce Handler ────────────────────────
      sendTransportObj.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const result = await Producers(
            sendTransportObj.id,
            kind,
            rtpParameters,
            'camera'
          );
          if (result?.producerId) {
            callback({ id: result.producerId });
          } else {
            errback(new Error('Failed to create producer'));
          }
        } catch (error: any) {
          console.error('❌ Produce handler error:', error);
          errback(error);
        }
      });

      ToastMsgs.success('✅ Transports created, connecting...');

      // ─── 8️⃣ Get Local User Media ──────────────────────────
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      const videoTrack = media.getVideoTracks()[0];
      const audioTrack = media.getAudioTracks()[0];

      if (!media || (!audioTrack && !videoTrack)) {
        ToastMsgs.error('❌ No media devices available');
        return;
      }

      // ─── 9️⃣ Set Local Stream ────────────────────────────
      setLocalStream(media);
      ToastMsgs.success('📸 Media captured successfully');

      // ─── 🔟 Produce Audio & Video ─────────────────────────
      const createdProducers: any[] = [];

      if (audioTrack) {
        const audioProducer = await sendTransportObj.produce({
          track: audioTrack,
          encodings: [{ maxBitrate: 64000 }],
          codecOptions: {
            opusStereo: true,
            opusFec: true,
            opusDtx: true,
          },
        });

        console.log(`🎤 Audio producer created: ${audioProducer.id}`);
        createdProducers.push({
          id: audioProducer.id,
          kind: 'audio',
          producer: audioProducer,
          track: audioTrack,
        });
      }

      if (videoTrack) {
        const videoProducer = await sendTransportObj.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100000 },
            { maxBitrate: 300000 },
            { maxBitrate: 900000 },
          ],
        });

        console.log(`📹 Video producer created: ${videoProducer.id}`);
        createdProducers.push({
          id: videoProducer.id,
          kind: 'video',
          producer: videoProducer,
          track: videoTrack,
        });
      }

      setProducers(createdProducers);
      setSendTransport(sendTransportObj);
      setRecvTransport(recvTransportObj);

      // ─── 1️⃣1️⃣ Consume Existing Producers In Room ──────────
      try {
        console.log(`🔍 Fetching existing producers for room: ${activeRoomId}...`);
        const roomProducersData = await sfuApi.getRoomProducers(activeRoomId);
        if (roomProducersData?.producers && Array.isArray(roomProducersData.producers)) {
          console.log(`📋 Found ${roomProducersData.producers.length} existing producer(s) in room`);
          for (const p of roomProducersData.producers) {
            if (p.socketId !== wsRef.current?.id && p.id) {
              await consumeProducer(recvTransportObj, dev, p.id, p.socketId, p.kind);
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch existing room producers:', err);
      }

      // ─── 1️⃣2️⃣ Setup Listeners for New Producers & Leaving Peers ─
      // Clear previous listeners
      unsubListenersRef.current.forEach((unsub) => unsub());
      unsubListenersRef.current = [];

      const unsubNewProducer = wsRef.current.on('newProducer', async (data: any) => {
        console.log('📢 Received newProducer event:', data);
        await consumeProducer(recvTransportObj, dev, data.producerId, data.socketId, data.kind);
      });

      const unsubProducerClosed = wsRef.current.on('producerClosed', (data: any) => {
        console.log('🗑️ Received producerClosed event:', data);
        setConsumers((prev) => prev.filter((c) => c.producerId !== data.producerId));
      });

      const unsubClientLeft = wsRef.current.on('clientLeft', (data: any) => {
        console.log('👋 Received clientLeft event:', data);
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          const stream = newMap.get(data.socketId);
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            newMap.delete(data.socketId);
          }
          return newMap;
        });
        setConsumers((prev) => prev.filter((c) => c.socketId !== data.socketId));
      });

      unsubListenersRef.current = [unsubNewProducer, unsubProducerClosed, unsubClientLeft];

      // ─── 1️⃣3️⃣ Mark Call as Active ───────────────────────
      setIsCallActive(true);
      ToastMsgs.success(`📞 Connected to room: ${activeRoomId}`);
    } catch (err: any) {
      ToastMsgs.error(`❌ Error: ${err.message}`);
      console.error('Error in establishDevice:', err);
      await leaveCall();
    } finally {
      setIsLoadingCall(false);
    }
  }, [
    roomId,
    wsConnected,
    getRtpCap,
    joinRoom,
    makeTransportSend,
    makeTransportRecv,
    ConnectTransport,
    Producers,
    consumeProducer,
    leaveCall,
  ]);

  // ─── Auto-connect WebSocket on mount ────────────────────
  useEffect(() => {
    makeWsConn();

    return () => {
      unsubListenersRef.current.forEach((unsub) => unsub());
      unsubListenersRef.current = [];
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
    };
  }, [makeWsConn]);

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="container mx-auto p-4 space-y-4">
      {/* ─── Controls Header ────────────────────────────────── */}
      <div className="card bg-base-100 shadow-md border border-base-200 p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">📹 SFU Client Test</h1>
            <span className={`badge ${wsConnected ? 'badge-success' : 'badge-error'} gap-1`}>
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
            {device && <span className="badge badge-info">Device Ready</span>}
            {isCallActive && <span className="badge badge-warning">Call Active</span>}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input input-bordered input-sm w-44"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
              disabled={isCallActive}
            />
            {!isCallActive ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={establishDevice}
                disabled={!wsConnected || isLoadingCall}
              >
                {isLoadingCall ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  '🚀 Load Device & Join'
                )}
              </button>
            ) : (
              <button className="btn btn-error btn-sm" onClick={leaveCall}>
                📞 End Call
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Video Grid (Removed per request) ───────────────────────────────────────── */}
      {isCallActive && (
        <div className="flex items-center justify-center p-8 bg-base-200 rounded-xl shadow-inner border border-base-300">
          <div className="text-center space-y-4">
            <div className="text-6xl animate-pulse">📷</div>
            <h2 className="text-xl font-semibold">Producing Video</h2>
            <p className="text-base-content/60">Your camera and microphone are being shared to the room.</p>
            <div className="badge badge-success gap-2 p-3">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              Live Transmission Active
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SfuTestPage;