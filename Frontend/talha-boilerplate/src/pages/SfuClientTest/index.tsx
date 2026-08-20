import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
 
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
} from '../SfuTest/query';

import { WebSocketClient } from '../../utils/websocket';
import { Device } from 'mediasoup-client';
import { ToastMsgs } from '@/api/toastUtils';

interface Props { }

const SfuTestPage = (props: Props) => {
    const [device, setDevice] = useState<Device | null>(null);
    const wsRef = useRef<WebSocketClient | null>(null);
    const [wsConnected, setWsConnected] = useState(false);

    // ─── WebSocket Connection ──────────────────────────────
    const makeWsConn = useCallback(async () => {
        try {
            // ✅ Check if already connected
            if (wsRef.current?.connected) {
                console.log('✅ WebSocket already connected');
                return;
            }

            const ws = new WebSocketClient({
                url: import.meta.env.VITE_WS_URL || "ws://localhost:9090",
                autoConnect: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });

            wsRef.current = ws;

            // ✅ Wait for connection
            await new Promise((resolve, reject) => {
                ws.on('connect', () => {
                    setWsConnected(true);
                    ToastMsgs.success("✅ WebSocket connected");
                    resolve(true);
                });
                ws.on('connect_error', (error) => {
                    reject(error);
                });
            });

        } catch (err) {
            setWsConnected(false);
            ToastMsgs.error(`❌ Error connecting to WS: ${err}`);
        }
    }, []);

    // ─── Get RTP Capabilities ──────────────────────────────
    const getRtpCap = useCallback(async () => {
        // Try WebSocket first
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

        // ─── Fallback to HTTP ──────────────────────────────
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

  const Producers = useCallback(async (
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
      return null;
    }
  }, [wsConnected]);
  const ConnectTransport = useCallback(async (transportId: string, dtlsParameters: any) => {
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
      return null;
    }
  }, [wsConnected]);


  const Consumers = useCallback(async (
    transportId: string,
    producerId: string,
    rtpCapabilities: any
  ) => {
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
      console.log('✅ Consumer created:', response);
      return response;
    } catch (error) {
      console.error('❌ Consume failed:', error);
      return null;
    }
  }, [wsConnected]);
  const PauseProducer = useCallback(async (producerId: string) => {
    if (!wsRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('⏸️ Pausing producer:', producerId);
      const response = await wsRef.current.emitPromise('pauseProducer', {
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
    if (!wsRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('▶️ Resuming producer:', producerId);
      const response = await wsRef.current.emitPromise('resumeProducer', {
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
    if (!wsRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('⏸️ Pausing consumer:', consumerId);
      const response = await wsRef.current.emitPromise('pauseConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer paused:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to pause consumer:', error);
      return null;
    }
  }, [wsConnected]);

    const CloseProducer = useCallback(async (producerId: string) => {
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
    }, [wsConnected]);

      const CloseConsumer = useCallback(async (consumerId: string) => {
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
      }, [wsConnected]);

// make server side send recive trasnport

  const makeTransportSend = useCallback(async (roomId: string) => {
    if (!wsRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🚀 Creating send transport for room:', roomId);
      const res = await wsRef.current.createSendTransport(roomId);
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
    if (!wsRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📥 Creating receive transport for room:', roomId);
      const res = await wsRef.current.createRecvTransport(roomId);
      if (res && !res.error) {
        console.log('✅ Receive transport created:', res);
        return res;
      }
    } catch (error) {
      console.warn('⚠️ WebSocket failed:', error);
    }
    return null;
  }, [wsConnected]);
// end

    // ─── Establish Device ──────────────────────────────────
const establishDevice = useCallback(async () => {
    try {
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

        // ─── 3️⃣ Create Transports ──────────────────────────
        const roomId = 'default-room';
        
        // ✅ Create SEND transport
        const transportData = await wsRef.current.createSendTransport(roomId);
        const sendTransport = dev.createSendTransport({
            id: transportData.id,
            iceParameters: transportData.iceParameters,
            iceCandidates: transportData.iceCandidates,
            dtlsParameters: transportData.dtlsParameters,
            sctpParameters: transportData.sctpParameters,
        });

        // ✅ Create RECV transport
        const recvTransportData = await wsRef.current.createRecvTransport(roomId);
        const recvTransport = dev.createRecvTransport({
            id: recvTransportData.id,  // ✅ Now it exists
            iceParameters: recvTransportData.iceParameters,
            iceCandidates: recvTransportData.iceCandidates,
            dtlsParameters: recvTransportData.dtlsParameters,
            sctpParameters: recvTransportData.sctpParameters,
        });
        
        // ─── 4️⃣ Connect SEND Transport ──────────────────────
        sendTransport.on('connect', ({ dtlsParameters }, callback) => {
            ConnectTransport(sendTransport.id, dtlsParameters)
                .then(() => {
                    callback();
                    ToastMsgs.success('🔐 Send transport connected!');
                })
                .catch((err) => {
                    callback(new Error('DTLS failed'));
                    ToastMsgs.error(`❌ Send DTLS failed: ${err}`);
                });
        });
        
        // ─── 5️⃣ Connect RECV Transport ──────────────────────
        recvTransport.on('connect', ({ dtlsParameters }, callback) => {
            ConnectTransport(recvTransport.id, dtlsParameters)
                .then(() => {
                    callback();
                    ToastMsgs.success('🔐 Recv transport connected!');
                })
                .catch((err) => {
                    callback(new Error('DTLS failed'));
                    ToastMsgs.error(`❌ Recv DTLS failed: ${err}`);
                });
        });
         
        ToastMsgs.success('✅ Transports created, connecting...');
//      now time for real fun attachj media
     const media=await navigator.mediaDevices.getUserMedia(
        {
            audio:true,
            video:true
        }
     )
     const videoSream=media?.getVideoTracks()[0]
     const audioTrack=media?.getAudioTracks()[0]
     
    } catch (err) {
        ToastMsgs.error(`❌ Error: ${err}`);
        console.error('Error:', err);
    }
}, [device, getRtpCap, wsRef.current, ConnectTransport]);

    // ─── Auto-connect WebSocket on mount ────────────────────
    useEffect(() => {
        makeWsConn();

        // ✅ Cleanup on unmount
        return () => {
            if (wsRef.current) {
                wsRef.current.destroy();
                wsRef.current = null;
            }
        };
    }, []); // ✅ Empty dependency array - runs once on mount

    return (
        <>
            <div className="flex gap-2 items-center p-4">
                <span className={`badge ${wsConnected ? 'badge-success' : 'badge-error'}`}>
                    {wsConnected ? '✅ Connected' : '❌ Disconnected'}
                </span>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={establishDevice}
                    disabled={!wsConnected}
                >
                    🚀 Load Device
                </button>
                {device && (
                    <span className="badge badge-success">✅ Device Ready</span>
                )}
            </div>
        </>
    );
};

export default SfuTestPage;