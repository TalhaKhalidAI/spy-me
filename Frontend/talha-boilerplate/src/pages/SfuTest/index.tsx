import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Table from './components/Table';
import {
  useRooms,
  useDeleteRoom,
  useCreateRoom,
  useForceCloseConsumer,
  useForceCloseProducer,
  useRoom,
  useRoomProducers,
  useRoomConsumers,
  useSFUStatus,
  useStartSFU,
  useStopSFU,
  useRestartSFU
} from './query';
import { sfuApi } from './sfu.api';
import { createRoomSchema, CreateRoomInput } from './schema';
import { WebSocketClient } from '@/utils/websocket';
import { Device } from 'mediasoup-client';
import { ToastMsgs } from '@/api/toastUtils';

// ─── Video Modal Component ──────────────────────────────────
interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  remoteStreams: Map<string, MediaStream>;
  localStream: MediaStream | null;
  isCallActive: boolean;
  onEndCall: () => void;
}

const VideoModal = ({
  isOpen,
  onClose,
  roomId,
  remoteStreams,
  localStream,
  isCallActive,
  onEndCall
}: VideoModalProps) => {
  if (!isOpen) return null;

  const remoteCount = remoteStreams.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-base-100 rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-200">
          <div>
            <h2 className="text-xl font-bold">📹 Video Conference</h2>
            <p className="text-sm text-base-content/60">Room: {roomId}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${isCallActive ? 'badge-success' : 'badge-error'}`}>
              {isCallActive ? '🟢 Live' : '🔴 Disconnected'}
            </span>
            <button
              className="btn btn-ghost btn-sm btn-square"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="p-4 bg-black/5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[400px]">
            {/* Local Video */}
            <div className="bg-black rounded-xl overflow-hidden aspect-video relative border-2 border-blue-500">
              {localStream ? (
                <video
                  ref={(el) => {
                    if (el && el.srcObject !== localStream) {
                      el.srcObject = localStream;
                      el.muted = true;
                      el.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  <div className="text-center">
                    <span className="text-4xl block">📷</span>
                    <span className="text-sm">No camera</span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 text-white/80 text-xs bg-black/60 px-2 py-1 rounded">
                📷 You
              </div>
              <div className="absolute top-2 right-2">
                <span className="badge badge-success badge-sm">Live</span>
              </div>
            </div>

            {/* Remote Videos */}
            {Array.from(remoteStreams.entries()).map(([id, stream]) => (
              <div
                key={id}
                className="bg-black rounded-xl overflow-hidden aspect-video relative border-2 border-green-500"
              >
                <video
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      el.srcObject = stream;
                      el.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 text-white/80 text-xs bg-black/60 px-2 py-1 rounded">
                  👤 {id.slice(0, 8)}...
                </div>
                <div className="absolute top-2 right-2">
                  <span className="badge badge-success badge-sm">Live</span>
                </div>
              </div>
            ))}

            {/* Empty state */}
            {remoteCount === 0 && isCallActive && (
              <div className="bg-black/50 rounded-xl aspect-video flex items-center justify-center border-2 border-dashed border-white/20">
                <div className="text-center text-white/50">
                  <span className="text-4xl block mb-2">👥</span>
                  <span className="text-sm">Waiting for others to join...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 p-4 border-t border-base-200 bg-base-100">
          <button
            className="btn btn-error btn-sm"
            onClick={() => {
              onEndCall();
              onClose();
            }}
          >
            📞 End Call
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            Close
          </button>
          <span className="text-xs text-base-content/40">
            {remoteCount} peer(s) connected
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────
const SfuTest = (): JSX.Element => {
  // ─── State ──────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [activeDetailTab, setActiveDetailTab] = useState<'producers' | 'consumers'>('producers');
  
  // ─── Device & Media State ──────────────────────────────────
  const [device, setDevice] = useState<Device | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [sendTransport, setSendTransport] = useState<any>(null);
  const [recvTransport, setRecvTransport] = useState<any>(null);
  const [producers, setProducers] = useState<any[]>([]);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  // ─── WebSocket State ───────────────────────────────────────
  const [wsConnected, setWsConnected] = useState(false);
  const [wsSocketId, setWsSocketId] = useState('');
  const wsClientRef = useRef<WebSocketClient | null>(null);

  // ─── SFU Control Queries & Mutations ──────────────────────
  const {
    data: sfuStatus,
    isLoading: isStatusLoading,
    refetch: refetchStatus
  } = useSFUStatus();

  const startSFU = useStartSFU();
  const stopSFU = useStopSFU();
  const restartSFU = useRestartSFU();

  // ─── WebSocket Connection ──────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.destroy();
      wsClientRef.current = null;
    }

    const client = new WebSocketClient({
      url: import.meta.env.VITE_WS_URL || "ws://localhost:9090",
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    client.on('connect', () => {
      setWsConnected(true);
      setWsSocketId(client.id);
      console.log('✅ WebSocket connected:', client.id);
    });

    client.on('disconnect', (reason) => {
      setWsConnected(false);
      setWsSocketId('');
      console.log('❌ WebSocket disconnected:', reason);
    });

    client.on('connect_error', (error) => {
      console.log('❌ WebSocket error:', error.message);
    });

    client.on('reconnect', (attempt) => {
      console.log(`🔄 WebSocket reconnected after ${attempt} attempts`);
    });

    client.on('reconnect_failed', () => {
      setWsConnected(false);
      console.log('❌ WebSocket reconnect failed');
    });

    client.on('newProducer', (data) => {
      console.log('📹 New producer:', data);
    });

    client.on('producerClosed', (data) => {
      console.log('🗑️ Producer closed:', data);
    });

    client.on('clientLeft', (data) => {
      console.log('👋 Client left:', data);
    });

    wsClientRef.current = client;
    console.log('💾 WebSocket client stored in ref');
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
      setWsConnected(false);
      setWsSocketId('');
      console.log('✅ WebSocket disconnected');
    }
  }, []);

  const toggleWebSocket = useCallback(() => {
    if (wsConnected) {
      disconnectWebSocket();
    } else {
      connectWebSocket();
    }
  }, [wsConnected, connectWebSocket, disconnectWebSocket]);

  // ─── WebSocket Cleanup ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ─── Get RTP Capabilities ──────────────────────────────────
  const getRtpCap = useCallback(async () => {
    if (wsClientRef.current && wsConnected) {
      try {
        console.log('📡 Trying WebSocket getRouterRtpCapabilities...');
        const res = await wsClientRef.current.getRouterRtpCapabilities();
        if (res && !res.error) {
          console.log('✅ WebSocket RTP Capabilities:', res);
          return res;
        }
      } catch (error) {
        console.warn('⚠️ WebSocket failed:', error);
      }
    }

    // ─── Fallback to HTTP ────────────────────────────────────
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

  // ─── Auto-get capabilities on connect ──────────────────────
  useEffect(() => {
    if (wsConnected) {
      getRtpCap();
    }
  }, [wsConnected, getRtpCap]);

  // ─── Transport Functions ──────────────────────────────────
  const makeTransportSend = useCallback(async (roomId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🚀 Creating send transport for room:', roomId);
      const res = await wsClientRef.current.createSendTransport(roomId);
      if (res && !res.error) {
        console.log('✅ Send transport created:', res);
        return res;
      }
    } catch (error) {
      console.warn('⚠️ WebSocket failed:', error);
    }
    return null;
  }, [wsConnected]);

  const makeTransportRecv = useCallback(async (roomId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📥 Creating receive transport for room:', roomId);
      const res = await wsClientRef.current.createRecvTransport(roomId);
      if (res && !res.error) {
        console.log('✅ Receive transport created:', res);
        return res;
      }
    } catch (error) {
      console.warn('⚠️ WebSocket failed:', error);
    }
    return null;
  }, [wsConnected]);

  const ConnectTransport = useCallback(async (transportId: string, dtlsParameters: any) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🔗 Connecting transport:', transportId);
      const response = await wsClientRef.current.emitPromise('connectTransport', {
        transportId: transportId,
        dtlsParameters: dtlsParameters,
      });
      console.log('✅ Transport connected:', response);
      return response;
    } catch (error) {
      console.error('❌ connectTransport failed:', error);
      return null;
    }
  }, [wsConnected]);

  // ─── Producer/Consumer Functions ──────────────────────────
  const Producers = useCallback(async (
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: any,
    source: string = 'camera'
  ) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📹 Producing:', kind, 'from', source);
      const response = await wsClientRef.current.emitPromise('produce', {
        transportId: transportId,
        kind: kind,
        rtpParameters: rtpParameters,
        source: source || 'camera',
      });
      console.log('✅ Producer created:', response);
      return response;
    } catch (error) {
      console.error('❌ Produce failed:', error);
      return null;
    }
  }, [wsConnected]);

  const Consumers = useCallback(async (
    transportId: string,
    producerId: string,
    rtpCapabilities: any
  ) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📥 Consuming producer:', producerId);
      const response = await wsClientRef.current.emitPromise('consume', {
        transportId: transportId,
        producerId: producerId,
        rtpCapabilities: rtpCapabilities,
      });
      console.log('✅ Consumer created:', response);
      return response;
    } catch (error) {
      console.error('❌ Consume failed:', error);
      return null;
    }
  }, [wsConnected]);

  // ─── Control Functions ─────────────────────────────────────
  const PauseProducer = useCallback(async (producerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('⏸️ Pausing producer:', producerId);
      const response = await wsClientRef.current.emitPromise('pauseProducer', {
        producerId: producerId,
      });
      console.log('✅ Producer paused:', producerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to pause producer:', error);
      return null;
    }
  }, [wsConnected]);

  const ResumeProducer = useCallback(async (producerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('▶️ Resuming producer:', producerId);
      const response = await wsClientRef.current.emitPromise('resumeProducer', {
        producerId: producerId,
      });
      console.log('✅ Producer resumed:', producerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to resume producer:', error);
      return null;
    }
  }, [wsConnected]);

  const PauseConsumer = useCallback(async (consumerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('⏸️ Pausing consumer:', consumerId);
      const response = await wsClientRef.current.emitPromise('pauseConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer paused:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to pause consumer:', error);
      return null;
    }
  }, [wsConnected]);

  const ResumeConsumer = useCallback(async (consumerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('▶️ Resuming consumer:', consumerId);
      const response = await wsClientRef.current.emitPromise('resumeConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer resumed:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to resume consumer:', error);
      return null;
    }
  }, [wsConnected]);

  const CloseProducer = useCallback(async (producerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🗑️ Closing producer:', producerId);
      const response = await wsClientRef.current.emitPromise('closeProducer', {
        producerId: producerId,
      });
      console.log('✅ Producer closed:', producerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to close producer:', error);
      return null;
    }
  }, [wsConnected]);

  const CloseConsumer = useCallback(async (consumerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🗑️ Closing consumer:', consumerId);
      const response = await wsClientRef.current.emitPromise('closeConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer closed:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to close consumer:', error);
      return null;
    }
  }, [wsConnected]);

  const unsubListenersRef = useRef<Array<() => void>>([]);

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

      if (peerSocketId === wsClientRef.current?.id) {
        console.log('⏭️ Skipping own producer:', producerId);
        return;
      }

      try {
        console.log(
          `📥 Requesting consume for producer ${producerId} (${kind || 'media'}) from ${peerSocketId}...`
        );

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

  // ─── Leave Call ────────────────────────────────────────────
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
      setIsVideoModalOpen(false);

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

  const joinRoom = useCallback(
    async (roomId: string) => {
      if (!wsClientRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return;
      }
      try {
        console.log(`🏠 Joining room: ${roomId}`);
        await wsClientRef.current.emitPromise('joinRoom', { roomId });
        ToastMsgs.success(`✅ Joined room: ${roomId}`);
      } catch (error: any) {
        console.error('❌ Failed to join room:', error);
        ToastMsgs.error(`❌ Failed to join room: ${error.message}`);
        throw error;
      }
    },
    [wsConnected]
  );

  // ─── Establish Device & Join Room ──────────────────────────
  const establishDevice = useCallback(
    async (targetRoomId?: string) => {
      try {
        // ─── 0️⃣ CHECK WebSocket Connection ──────────────
        if (!wsClientRef.current) {
          ToastMsgs.error('❌ WebSocket client not initialized');
          return;
        }

        if (!wsConnected) {
          ToastMsgs.error('❌ WebSocket not connected');
          return;
        }

        const activeRoomId = targetRoomId || selectedRoomId || 'talha-room';

        // ─── 1️⃣ Get RTP Capabilities ──────────────────────
        const rcap = await getRtpCap();
        if (!rcap) {
          ToastMsgs.error('❌ Failed to get RTP capabilities');
          return;
        }

        // ─── 2️⃣ Create & Load Device ──────────────────────
        const dev = new Device();
        await dev.load({ routerRtpCapabilities: rcap });
        setDevice(dev);
        ToastMsgs.success('✅ Device loaded successfully');

        // ─── 3️⃣ Join Room ──────────────────────────────────
        await joinRoom(activeRoomId);

        // ─── 4️⃣ Create Transports ──────────────────────────
        // SEND transport
        const transportData = await wsClientRef.current.createSendTransport(activeRoomId);
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
        const recvTransportData = await wsClientRef.current.createRecvTransport(activeRoomId);
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

        // ─── 5️⃣ Connect SEND Transport ──────────────────────
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

        // ─── 6️⃣ Connect RECV Transport ──────────────────────
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

        // ─── 7️⃣ Setup Produce Handler ──────────────────────
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

        // ─── 8️⃣ Get Media ──────────────────────────────────
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

        // ─── 9️⃣ Set Local Stream ──────────────────────────
        setLocalStream(media);
        ToastMsgs.success('📸 Media captured successfully');

        // ─── 🔟 Produce Audio & Video ──────────────────────
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

          console.log(`🎤 Audio producer: ${audioProducer.id}`);
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

          console.log(`📹 Video producer: ${videoProducer.id}`);
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

        // ─── 1️⃣1️⃣ Consume Existing Producers In Room ────────
        try {
          console.log(`🔍 Fetching existing producers for room: ${activeRoomId}...`);
          const roomProducersData = await sfuApi.getRoomProducers(activeRoomId);
          if (roomProducersData?.producers && Array.isArray(roomProducersData.producers)) {
            console.log(`📋 Found ${roomProducersData.producers.length} existing producer(s) in room`);
            for (const p of roomProducersData.producers) {
              if (p.socketId !== wsClientRef.current?.id && p.id) {
                await consumeProducer(recvTransportObj, dev, p.id, p.socketId, p.kind);
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ Could not fetch existing room producers:', err);
        }

        // ─── 1️⃣2️⃣ Setup Socket Listeners ────────────────────
        unsubListenersRef.current.forEach((unsub) => unsub());
        unsubListenersRef.current = [];

        const unsubNewProducer = wsClientRef.current.on('newProducer', async (data: any) => {
          console.log('📢 Received newProducer event:', data);
          await consumeProducer(recvTransportObj, dev, data.producerId, data.socketId, data.kind);
        });

        const unsubProducerClosed = wsClientRef.current.on('producerClosed', (data: any) => {
          console.log('🗑️ Received producerClosed event:', data);
          setConsumers((prev) => prev.filter((c) => c.producerId !== data.producerId));
        });

        const unsubClientLeft = wsClientRef.current.on('clientLeft', (data: any) => {
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

        // ─── 1️⃣3️⃣ Mark Call as Active & Open Modal ────────
        setIsCallActive(true);
        setIsVideoModalOpen(true);
        ToastMsgs.success(`📞 Connected to room: ${activeRoomId}`);
      } catch (err: any) {
        ToastMsgs.error(`❌ Error: ${err.message}`);
        console.error('Error in establishDevice:', err);
        await leaveCall();
      }
    },
    [
      selectedRoomId,
      wsConnected,
      getRtpCap,
      joinRoom,
      ConnectTransport,
      Producers,
      consumeProducer,
      leaveCall,
    ]
  );

const MakeCall = useCallback(async (roomId: string) => {
    // ─── Check WebSocket connection FIRST ──────────────
    if (!wsClientRef.current || !wsConnected) {
        ToastMsgs.error('❌ WebSocket not connected. Please connect first.');
        console.warn('⚠️ WebSocket not connected');
        return;
    }

    // If already in a call, leave first
    if (isCallActive) {
        await leaveCall();
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    setSelectedRoomId(roomId);
    await establishDevice(roomId);
}, [establishDevice, isCallActive, leaveCall, wsConnected]);

  // ─── End Call ──────────────────────────────────────────────
  const endCall = useCallback(async () => {
    await leaveCall();
    setSelectedRows([]);
    setIsVideoModalOpen(false);
  }, [leaveCall]);

  // ─── Room Queries & Mutations ─────────────────────────────
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
    isSuccess
  } = useRooms();

  const {
    data: roomDetail,
    isLoading: isRoomDetailLoading,
    refetch: refetchRoomDetail
  } = useRoom(selectedRoomId, {
    enabled: !!selectedRoomId,
  });

  const {
    data: producersData,
    isLoading: isProducersLoading,
    refetch: refetchProducers
  } = useRoomProducers(selectedRoomId, {
    enabled: !!selectedRoomId,
  });

  const {
    data: consumersData,
    isLoading: isConsumersLoading,
    refetch: refetchConsumers
  } = useRoomConsumers(selectedRoomId, {
    enabled: !!selectedRoomId,
  });

  const deleteRoom = useDeleteRoom();
  const createRoom = useCreateRoom();
  const forceCloseConsumer = useForceCloseConsumer();
  const forceCloseProducer = useForceCloseProducer();

  // ─── Auto-refresh ──────────────────────────────────────────
  useEffect(() => {
    refetch();
    refetchStatus();
  }, []);

  useEffect(() => {
    if (isSuccess) {
      console.log('✅ Data loaded successfully:', data);
    }
  }, [data, isSuccess]);

  useEffect(() => {
    if (isDetailModalOpen && selectedRoomId) {
      refetchRoomDetail();
      refetchProducers();
      refetchConsumers();
    }
  }, [isDetailModalOpen, selectedRoomId, refetchRoomDetail, refetchProducers, refetchConsumers]);

  // ─── React Hook Form ──────────────────────────────────────
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    reset,
    watch,
  } = useForm<CreateRoomInput>({
    resolver: zodResolver(createRoomSchema),
    mode: 'onChange',
    defaultValues: {
      roomId: '',
    },
  });

  const roomId = watch('roomId');

  // ─── SFU Control Handlers ──────────────────────────────────
  const handleStartSFU = () => {
    startSFU.mutate({}, {
      onSuccess: () => {
        console.log('✅ SFU started');
        refetchStatus();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to start SFU: ${error.message}`);
      },
    });
  };

  const handleStopSFU = () => {
    if (!window.confirm('⚠️ Are you sure you want to stop SFU? This will close all connections.')) return;
    stopSFU.mutate(undefined, {
      onSuccess: () => {
        console.log('✅ SFU stopped');
        refetchStatus();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to stop SFU: ${error.message}`);
      },
    });
  };

  const handleRestartSFU = () => {
    if (!window.confirm('⚠️ Are you sure you want to restart SFU? This will close all connections.')) return;
    restartSFU.mutate({}, {
      onSuccess: () => {
        console.log('✅ SFU restarted');
        refetchStatus();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to restart SFU: ${error.message}`);
      },
    });
  };

  // ─── Handle Delete ────────────────────────────────────────
  const handleDeleteRoom = (room_id: string) => {
    if (window.confirm(`Delete room "${room_id}"?`)) {
      deleteRoom.mutate(room_id, {
        onSuccess: () => refetch(),
      });
    }
  };

  // ─── Handle Create ────────────────────────────────────────
  const onSubmit = (data: CreateRoomInput) => {
    createRoom.mutate(
      { roomId: data.roomId },
      {
        onSuccess: () => {
          reset();
          setIsModalOpen(false);
          refetch();
        },
        onError: (error) => {
          alert(`❌ Failed to create room: ${error.message}`);
        },
      }
    );
  };

  // ─── Handle Bulk Delete ──────────────────────────────────
  const handleBulkDelete = () => {
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Delete ${selectedRows.length} room(s)?`)) return;
    selectedRows.forEach((row) => {
      deleteRoom.mutate(row.room_id);
    });
    setSelectedRows([]);
    setTimeout(() => refetch(), 500);
  };

  // ─── Handle Force Close ──────────────────────────────────
  const handleForceCloseProducer = (producerId: string) => {
    if (!window.confirm(`Force close producer "${producerId}"?`)) return;
    forceCloseProducer.mutate(producerId, {
      onSuccess: () => {
        console.log('✅ Producer closed:', producerId);
        refetchProducers();
        refetchRoomDetail();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to close producer: ${error.message}`);
      },
    });
  };

  const handleForceCloseConsumer = (consumerId: string) => {
    if (!window.confirm(`Force close consumer "${consumerId}"?`)) return;
    forceCloseConsumer.mutate(consumerId, {
      onSuccess: () => {
        console.log('✅ Consumer closed:', consumerId);
        refetchConsumers();
        refetchRoomDetail();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to close consumer: ${error.message}`);
      },
    });
  };

  // ─── Handle View Details ──────────────────────────────────
  const handleViewDetails = (roomId: string) => {
    setSelectedRoomId(roomId);
    setIsDetailModalOpen(true);
  };

  // ─── Transform Data ──────────────────────────────────────
  const roomsData = useMemo(() => {
    if (!data) return [];
    let rooms = [];
    if (Array.isArray(data)) {
      rooms = data;
    } else if (data.rooms && Array.isArray(data.rooms)) {
      rooms = data.rooms;
    } else if (data.data && Array.isArray(data.data)) {
      rooms = data.data;
    } else if (data.data?.rooms && Array.isArray(data.data.rooms)) {
      rooms = data.data.rooms;
    } else if (data.roomId) {
      rooms = [data];
    } else {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          rooms = data[key];
          break;
        }
      }
    }
    if (!Array.isArray(rooms) || rooms.length === 0) return [];

    return rooms.map((room: any) => ({
      room_id: room.roomId || room.id || 'unknown',
      router_id: room.routerId || room.router_id || 'unknown',
      active: room.active ? 'Active' : 'Inactive',
      producer: Array.isArray(room.producers) ? room.producers.length : (room.producers || 0),
      consumer: Array.isArray(room.consumers) ? room.consumers.length : (room.consumers || 0),
    }));
  }, [data]);

  // ─── Get Producers/Consumers Lists ──────────────────────
  const producersList = useMemo(() => {
    if (!producersData?.producers) return [];
    return producersData.producers;
  }, [producersData]);

  const consumersList = useMemo(() => {
    if (!consumersData?.consumers) return [];
    return consumersData.consumers;
  }, [consumersData]);

  // ─── Columns ──────────────────────────────────────────────
  const columns = useMemo(() => [
    { key: 'room_id', label: 'Room ID', sortable: true, searchable: true },
    { key: 'router_id', label: 'Router ID', sortable: true, searchable: true },
    {
      key: 'active',
      label: 'Status',
      render: (value: string) => (
        <span className={`badge ${value === 'Active' ? 'badge-success' : 'badge-error'} badge-sm gap-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${value === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {value}
        </span>
      )
    },
    { key: 'producer', label: 'Producers' },
    { key: 'consumer', label: 'Consumers' },
  ], []);

  // ─── Handlers ──────────────────────────────────────────────
  const handleRowSelect = (row: any, checked: boolean) => {
    if (checked) {
      setSelectedRows([...selectedRows, row]);
    } else {
      setSelectedRows(selectedRows.filter((r) => r.room_id !== row.room_id));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedRows(checked ? roomsData : []);
  };

  // ─── Loading/Error States ─────────────────────────────────
  if (isLoading || isStatusLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="alert alert-error shadow-lg">
          <span>❌ Error loading rooms: {error.message}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-4">
      {/* ─── SFU Control Panel ───────────────────────────────── */}
      <div className="card bg-base-100 shadow-xl border border-base-200 mb-6">
        <div className="card-body p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">⚙️ SFU Control</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${sfuStatus?.initialized ? 'badge-success' : 'badge-error'} gap-1`}>
                  <span className={`w-2 h-2 rounded-full ${sfuStatus?.initialized ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  {sfuStatus?.initialized ? 'Running' : 'Stopped'}
                </span>
                <span className="text-xs text-base-content/40">
                  Workers: {sfuStatus?.workers || 0} |
                  Routers: {sfuStatus?.routers || 0} |
                  Transports: {sfuStatus?.transports || 0}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-success btn-sm" onClick={handleStartSFU} disabled={sfuStatus?.initialized || startSFU.isPending}>
                {startSFU.isPending ? <span className="loading loading-spinner loading-xs"></span> : '▶️ Start'}
              </button>
              <button className="btn btn-error btn-sm" onClick={handleStopSFU} disabled={!sfuStatus?.initialized || stopSFU.isPending}>
                {stopSFU.isPending ? <span className="loading loading-spinner loading-xs"></span> : '⏹️ Stop'}
              </button>
              <button className="btn btn-warning btn-sm" onClick={handleRestartSFU} disabled={!sfuStatus?.initialized || restartSFU.isPending}>
                {restartSFU.isPending ? <span className="loading loading-spinner loading-xs"></span> : '🔄 Restart'}
              </button>
              <button className="btn btn-ghost btn-sm btn-square" onClick={() => refetchStatus()} title="Refresh Status">🔄</button>
            </div>
          </div>

          {sfuStatus?.workerStatuses && sfuStatus.workerStatuses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-base-200">
              <div className="flex flex-wrap gap-4">
                {sfuStatus.workerStatuses.map((worker: any) => (
                  <div key={worker.pid} className="flex items-center gap-2 text-sm">
                    <span className="font-mono">PID: {worker.pid}</span>
                    <span className={`badge ${worker.alive ? 'badge-success' : 'badge-error'} badge-xs`}>
                      {worker.alive ? 'Alive' : 'Dead'}
                    </span>
                    <span className="text-xs text-base-content/40">
                      Created: {new Date(worker.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Rooms Header ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">🏠 Rooms</h1>
          <span className="text-xs text-base-content/40">
            {roomsData.length} room(s) found{isFetching && ' (refreshing...)'}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>➕ New Room</button>
          <button className={`btn btn-ghost btn-sm ${isFetching ? 'loading' : ''}`} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Loading...' : '🔄'}
          </button>
        </div>
      </div>

      {/* ─── WebSocket Control ───────────────────────────────── */}
      <div className="bg-base-100 rounded-lg shadow-sm border border-base-200 p-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-base-content/70">🔌 WebSocket</span>
          <div className="flex items-center gap-2">
            <span className={`badge ${wsConnected ? 'badge-success' : 'badge-error'} gap-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {wsConnected ? 'Connected' : 'Disconnected'}
            </span>
            {wsConnected && wsSocketId && (
              <span className="text-xs text-base-content/40 font-mono">ID: {wsSocketId.slice(0, 8)}...</span>
            )}
            <span className="text-xs text-base-content/30">Ref: {wsClientRef.current ? '✅ Stored' : '❌ Empty'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer gap-2 items-center">
            <span className="text-xs text-base-content/50">Off</span>
            <input type="checkbox" className="toggle toggle-primary toggle-sm" checked={wsConnected} onChange={toggleWebSocket} />
            <span className="text-xs text-base-content/50">On</span>
          </label>
          {wsConnected && (
            <button className="btn btn-ghost btn-xs btn-square text-error" onClick={disconnectWebSocket} title="Disconnect">✕</button>
          )}
        </div>
      </div>

      {/* ─── Call Status ──────────────────────────────────────── */}
      {isCallActive && (
        <div className="alert alert-success shadow-lg mb-4">
          <span>📞 Call active in room: {selectedRoomId}</span>
          <button className="btn btn-error btn-sm" onClick={endCall}>⏹️ End Call</button>
        </div>
      )}

      {/* ─── Selected Rows Info ────────────────────────────── */}
      {selectedRows.length > 0 && (
        <div className="bg-primary/10 p-3 rounded-lg mb-4 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium">✅ {selectedRows.length} room(s) selected</span>
          <div className="flex gap-2">
            <button className="btn btn-error btn-sm" onClick={handleBulkDelete}>🗑️ Delete Selected</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRows([])}>Clear</button>
          </div>
        </div>
      )}

      {/* ─── Table ───────────────────────────────────────────── */}
      {roomsData.length > 0 ? (
        <Table
          columns={columns}
          data={roomsData}
          rowKey="room_id"
          showRowNumbers
          showCheckbox
          selectedRows={selectedRows}
          onRowSelect={handleRowSelect}
          onSelectAll={handleSelectAll}
          showSearch
          showPagination
          itemsPerPage={10}
          defaultSortKey="room_id"
          actions={[
            {
              icon: '👁️',
              title: 'View Details',
              variant: 'info',
              onClick: (row) => {
                handleViewDetails(row?.room_id);
              },
            },
            {
              icon: '📹',
              title: 'Video Live',
              variant: 'success',
              onClick: async (row) => {
                console.log('🎥 Video Live clicked for room:', row?.room_id);
                await MakeCall(row?.room_id);
              },
            },
            {
              icon: '🗑️',
              title: 'Delete Room',
              variant: 'error',
              onClick: (row) => {
                handleDeleteRoom(row?.room_id);
              },
            },
          ]}
        />
      ) : (
        <div className="text-center py-12 bg-base-200/50 rounded-xl border-2 border-dashed border-base-300">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-base-content/50">No rooms found</p>
          <button className="btn btn-primary btn-sm mt-4" onClick={() => setIsModalOpen(true)}>➕ Create your first room</button>
        </div>
      )}

      {/* ─── Video Modal ─────────────────────────────────────── */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        roomId={selectedRoomId}
        remoteStreams={remoteStreams}
        localStream={localStream}
        isCallActive={isCallActive}
        onEndCall={endCall}
      />

      {/* ─── Create Room Modal ──────────────────────────────── */}
      <dialog className={`modal ${isModalOpen ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg">🏠 Create New Room</h3>
          <p className="text-sm text-base-content/60 mb-4">Enter a unique room ID to create a new WebRTC room.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Room ID</span>
                <span className="label-text-alt text-error">* Required</span>
              </label>
              <input
                {...register('roomId')}
                type="text"
                className={`input input-bordered w-full transition-all duration-200 ${errors.roomId ? 'input-error' : ''} ${roomId && !errors.roomId ? 'input-success' : ''}`}
                placeholder="e.g., meeting-room-123"
                autoFocus
                disabled={isSubmitting || createRoom.isPending}
              />
              {errors.roomId && (
                <div className="mt-2 flex items-center gap-2 text-error text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errors.roomId.message}</span>
                </div>
              )}
              {roomId && !errors.roomId && (
                <div className="mt-2 flex items-center gap-2 text-success text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Valid room ID</span>
                </div>
              )}
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => { setIsModalOpen(false); reset(); }} disabled={isSubmitting || createRoom.isPending}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!!errors.roomId || !roomId || isSubmitting || createRoom.isPending}>
                {isSubmitting || createRoom.isPending ? <span className="loading loading-spinner loading-xs"></span> : 'Create Room'}
              </button>
            </div>
          </form>
        </div>
        <div className="modal-backdrop" onClick={() => { setIsModalOpen(false); reset(); }}></div>
      </dialog>

      {/* ─── Room Detail Modal ──────────────────────────────── */}
      <dialog className={`modal ${isDetailModalOpen ? 'modal-open' : ''}`}>
        <div className="modal-box max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xl">📍 Room: {selectedRoomId}</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => { setIsDetailModalOpen(false); setSelectedRoomId(''); }}>✕ Close</button>
          </div>

          {isRoomDetailLoading || isProducersLoading || isConsumersLoading ? (
            <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg text-primary"></span></div>
          ) : roomDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat bg-base-200 rounded-lg p-3">
                  <div className="stat-title text-xs">Status</div>
                  <div className="stat-value text-base"><span className={roomDetail.active ? 'text-success' : 'text-error'}>{roomDetail.active ? '🟢 Active' : '🔴 Inactive'}</span></div>
                </div>
                <div className="stat bg-base-200 rounded-lg p-3">
                  <div className="stat-title text-xs">Router ID</div>
                  <div className="stat-value text-xs font-mono truncate">{roomDetail.routerId}</div>
                </div>
                <div className="stat bg-base-200 rounded-lg p-3">
                  <div className="stat-title text-xs">Producers</div>
                  <div className="stat-value text-base font-mono">{producersList.length}</div>
                </div>
                <div className="stat bg-base-200 rounded-lg p-3">
                  <div className="stat-title text-xs">Consumers</div>
                  <div className="stat-value text-base font-mono">{consumersList.length}</div>
                </div>
              </div>

              <div className="tabs tabs-boxed bg-base-200 p-0.5">
                <button className={`tab tab-sm ${activeDetailTab === 'producers' ? 'tab-active' : ''}`} onClick={() => setActiveDetailTab('producers')}>🎬 Producers ({producersList.length})</button>
                <button className={`tab tab-sm ${activeDetailTab === 'consumers' ? 'tab-active' : ''}`} onClick={() => setActiveDetailTab('consumers')}>📡 Consumers ({consumersList.length})</button>
              </div>

              {activeDetailTab === 'producers' && (
                <div className="overflow-x-auto">
                  {producersList.length === 0 ? (
                    <div className="text-center py-8 text-base-content/40"><span className="text-4xl block mb-2">📭</span>No producers in this room</div>
                  ) : (
                    <table className="table table-sm table-zebra">
                      <thead><tr><th>ID</th><th>Kind</th><th>Source</th><th>Socket ID</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {producersList.map((producer: any) => (
                          <tr key={producer.id}>
                            <td className="font-mono text-xs">{producer.id.slice(0, 8)}...</td>
                            <td><span className={`badge ${producer.kind === 'video' ? 'badge-primary' : 'badge-secondary'} badge-xs`}>{producer.kind}</span></td>
                            <td>{producer.source}</td>
                            <td className="font-mono text-xs">{producer.socketId.slice(0, 6)}...</td>
                            <td><span className={`badge ${producer.paused ? 'badge-warning' : 'badge-success'} badge-xs`}>{producer.paused ? '⏸️ Paused' : '▶️ Active'}</span></td>
                            <td><button className="btn btn-ghost btn-xs text-error" onClick={() => handleForceCloseProducer(producer.id)} title="Force Close Producer">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeDetailTab === 'consumers' && (
                <div className="overflow-x-auto">
                  {consumersList.length === 0 ? (
                    <div className="text-center py-8 text-base-content/40"><span className="text-4xl block mb-2">📭</span>No consumers in this room</div>
                  ) : (
                    <table className="table table-sm table-zebra">
                      <thead><tr><th>ID</th><th>Producer ID</th><th>Kind</th><th>Socket ID</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {consumersList.map((consumer: any) => (
                          <tr key={consumer.id}>
                            <td className="font-mono text-xs">{consumer.id.slice(0, 8)}...</td>
                            <td className="font-mono text-xs">{consumer.producerId.slice(0, 8)}...</td>
                            <td><span className={`badge ${consumer.kind === 'video' ? 'badge-primary' : 'badge-secondary'} badge-xs`}>{consumer.kind}</span></td>
                            <td className="font-mono text-xs">{consumer.socketId.slice(0, 6)}...</td>
                            <td><span className={`badge ${consumer.paused ? 'badge-warning' : 'badge-success'} badge-xs`}>{consumer.paused ? '⏸️ Paused' : '▶️ Active'}</span></td>
                            <td><button className="btn btn-ghost btn-xs text-error" onClick={() => handleForceCloseConsumer(consumer.id)} title="Force Close Consumer">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-base-content/40"><span className="text-4xl block mb-2">❌</span>Failed to load room details</div>
          )}
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => { setIsDetailModalOpen(false); setSelectedRoomId(''); }}>Close</button>
          </div>
        </div>
        <div className="modal-backdrop" onClick={() => { setIsDetailModalOpen(false); setSelectedRoomId(''); }}></div>
      </dialog>
    </div>
  );
};

export default SfuTest;