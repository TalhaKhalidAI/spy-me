// ============================================================
// React Hook: SFU WebSocket with Mediasoup Integration
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { Device } from 'mediasoup-client';
import type {
  WebSocketClient,
  WebSocketConfig,
  useWebSocket,
  WSProducer,
  WSProducerClosed,
  WSClientLeft,
  WSTransportConnected,
  WSTransportError,
} from '../utils/websocket';

export interface SFUWebSocketState {
  isConnected: boolean;
  socketId: string;
  device: Device | null;
  sendTransport: any | null;
  recvTransport: any | null;
  producers: WSProducer[];
  consumers: any[];
  isReady: boolean;
}

export interface SFUWebSocketActions {
  connect: () => void;
  disconnect: () => void;
  initDevice: (routerRtpCapabilities: any) => Promise<Device>;
  createSendTransport: () => Promise<any>;
  createRecvTransport: () => Promise<any>;
  connectTransport: (transportId: string, dtlsParameters: any) => Promise<void>;
  produce: (params: {
    transportId: string;
    kind: 'audio' | 'video';
    rtpParameters: any;
    source?: string;
  }) => Promise<{ producerId: string }>;
  consume: (params: {
    transportId: string;
    producerId: string;
    rtpCapabilities: any;
    roomId?: string;
  }) => Promise<any>;
  pauseProducer: (producerId: string) => Promise<void>;
  resumeProducer: (producerId: string) => Promise<void>;
  pauseConsumer: (consumerId: string) => Promise<void>;
  resumeConsumer: (consumerId: string) => Promise<void>;
  closeProducer: (producerId: string) => Promise<void>;
  closeConsumer: (consumerId: string) => Promise<void>;
}

export function useSFUWebSocket(
  config: WebSocketConfig
): [SFUWebSocketState, SFUWebSocketActions] {
  // ─── State ──────────────────────────────────────────────────
  const [state, setState] = useState<SFUWebSocketState>({
    isConnected: false,
    socketId: '',
    device: null,
    sendTransport: null,
    recvTransport: null,
    producers: [],
    consumers: [],
    isReady: false,
  });

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const clientRef = useRef<WebSocketClient | null>(null);
  const producersRef = useRef<WSProducer[]>([]);
  const consumersRef = useRef<any[]>([]);

  // ─── Update State Helpers ──────────────────────────────────

  const updateState = useCallback((updates: Partial<SFUWebSocketState>) => {
    setState(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  // ─── WebSocket Client ──────────────────────────────────────

  useEffect(() => {
    const client = new WebSocketClient({
      ...config,
      autoConnect: true,
    });

    clientRef.current = client;

    // ─── Connection Events ──────────────────────────────────

    const unsubConnect = client.on('connect', () => {
      updateState({
        isConnected: true,
        socketId: client.id,
      });
    });

    const unsubDisconnect = client.on('disconnect', () => {
      updateState({
        isConnected: false,
        socketId: '',
        isReady: false,
      });
    });

    // ─── SFU Events ──────────────────────────────────────────

    const unsubNewProducer = client.on('newProducer', (data: WSProducer) => {
      producersRef.current = [...producersRef.current, data];
      updateState({ producers: producersRef.current });
    });

    const unsubProducerClosed = client.on(
      'producerClosed',
      (data: WSProducerClosed) => {
        producersRef.current = producersRef.current.filter(
          p => p.producerId !== data.producerId
        );
        updateState({ producers: producersRef.current });
      }
    );

    const unsubClientLeft = client.on('clientLeft', (data: WSClientLeft) => {
      // Remove all producers from this client
      producersRef.current = producersRef.current.filter(
        p => p.socketId !== data.socketId
      );
      updateState({ producers: producersRef.current });
    });

    const unsubTransportConnected = client.on(
      'transportConnected',
      (data: WSTransportConnected) => {
        // console.log(`🔗 Transport connected: ${data.transportId}`);
      }
    );

    const unsubTransportError = client.on(
      'transportError',
      (data: WSTransportError) => {
        console.error(`❌ Transport ${data.transportId} error:`, data.error);
      }
    );

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubNewProducer();
      unsubProducerClosed();
      unsubClientLeft();
      unsubTransportConnected();
      unsubTransportError();
      client.destroy();
      clientRef.current = null;
    };
  }, [config.url, updateState]);

  // ─── Actions ──────────────────────────────────────────────

  const connect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  const initDevice = useCallback(
    async (routerRtpCapabilities: any): Promise<Device> => {
      const device = new Device();
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;
      updateState({ device });
      return device;
    },
    [updateState]
  );

  const createSendTransport = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error('WebSocket not connected');
    }
    if (!deviceRef.current) {
      throw new Error('Device not initialized');
    }

    const data = await clientRef.current.createSendTransport();

    const transport = deviceRef.current.createSendTransport({
      id: data.id,
      iceParameters: data.iceParameters,
      iceCandidates: data.iceCandidates,
      dtlsParameters: data.dtlsParameters,
      sctpParameters: data.sctpParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    transport.on('connect', ({ dtlsParameters }, callback) => {
      clientRef.current?.connectTransport(transport.id, dtlsParameters);
      callback();
    });

    transport.on('produce', async ({ kind, rtpParameters }, callback) => {
      try {
        const result = await clientRef.current!.produce({
          transportId: transport.id,
          kind,
          rtpParameters,
          source: 'camera',
        });
        callback({ id: result.producerId });
      } catch (error) {
        callback(new Error(String(error)));
      }
    });

    sendTransportRef.current = transport;
    updateState({ sendTransport: transport });

    return transport;
  }, [updateState]);

  const createRecvTransport = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error('WebSocket not connected');
    }
    if (!deviceRef.current) {
      throw new Error('Device not initialized');
    }

    const data = await clientRef.current.createRecvTransport();

    const transport = deviceRef.current.createRecvTransport({
      id: data.id,
      iceParameters: data.iceParameters,
      iceCandidates: data.iceCandidates,
      dtlsParameters: data.dtlsParameters,
      sctpParameters: data.sctpParameters,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    transport.on('connect', ({ dtlsParameters }, callback) => {
      clientRef.current?.connectTransport(transport.id, dtlsParameters);
      callback();
    });

    recvTransportRef.current = transport;
    updateState({ recvTransport: transport });

    return transport;
  }, [updateState]);

  const connectTransport = useCallback(
    async (transportId: string, dtlsParameters: any) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.connectTransport(transportId, dtlsParameters);
    },
    []
  );

  const produce = useCallback(
    async (params: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: any;
      source?: string;
    }) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      return clientRef.current.produce(params);
    },
    []
  );

  const consume = useCallback(
    async (params: {
      transportId: string;
      producerId: string;
      rtpCapabilities: any;
      roomId?: string;
    }) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      const result = await clientRef.current.consume({
        ...params,
        socketId: clientRef.current.id,
      });

      // Store consumer
      const consumer = {
        ...result,
        socketId: params.producerId,
      };
      consumersRef.current = [...consumersRef.current, consumer];
      updateState({ consumers: consumersRef.current });

      return result;
    },
    [updateState]
  );

  const pauseProducer = useCallback(
    async (producerId: string) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.pauseProducer(producerId);
    },
    []
  );

  const resumeProducer = useCallback(
    async (producerId: string) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.resumeProducer(producerId);
    },
    []
  );

  const pauseConsumer = useCallback(
    async (consumerId: string) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.pauseConsumer(consumerId);
    },
    []
  );

  const resumeConsumer = useCallback(
    async (consumerId: string) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.resumeConsumer(consumerId);
    },
    []
  );

  const closeProducer = useCallback(
    async (producerId: string) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.closeProducer(producerId);
      producersRef.current = producersRef.current.filter(
        p => p.producerId !== producerId
      );
      updateState({ producers: producersRef.current });
    },
    [updateState]
  );

  const closeConsumer = useCallback(
    async (consumerId: string) => {
      if (!clientRef.current) {
        throw new Error('WebSocket not connected');
      }
      await clientRef.current.closeConsumer(consumerId);
      consumersRef.current = consumersRef.current.filter(
        c => c.id !== consumerId
      );
      updateState({ consumers: consumersRef.current });
    },
    [updateState]
  );

  const actions: SFUWebSocketActions = {
    connect,
    disconnect,
    initDevice,
    createSendTransport,
    createRecvTransport,
    connectTransport,
    produce,
    consume,
    pauseProducer,
    resumeProducer,
    pauseConsumer,
    resumeConsumer,
    closeProducer,
    closeConsumer,
  };

  return [state, actions];
}