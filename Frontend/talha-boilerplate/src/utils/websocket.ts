// ============================================================
// WebSocket Helper with Reconnection & Typed Events
// ============================================================

import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';

// ─── Configuration ──────────────────────────────────────────

export interface WebSocketConfig {
  url: string;
  options?: Partial<ManagerOptions & SocketOptions>;
  autoConnect?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
}

const DEFAULT_CONFIG: Partial<WebSocketConfig> = {
  autoConnect: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
};

// ─── Event Types ────────────────────────────────────────────

export interface WSClient {
  socketId: string;
  identity?: string;
  roomId?: string;
}

export interface WSProducer {
  producerId: string;
  kind: 'audio' | 'video';
  source: 'camera' | 'mic' | 'screen' | 'custom';
  socketId: string;
}

export interface WSProducerClosed {
  producerId: string;
}

export interface WSClientLeft {
  socketId: string;
}

export interface WSTransportConnected {
  transportId: string;
}

export interface WSTransportError {
  transportId: string;
  error: string;
}

export interface WSTransportData {
  id: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
  sctpParameters: any;
}

// ─── WebSocket Events Map ──────────────────────────────────

export interface WebSocketEvents {
  // Server -> Client
  connect: () => void;
  connect_error: (error: Error) => void;
  disconnect: (reason: string) => void;
  reconnect: (attemptNumber: number) => void;
  reconnect_attempt: (attemptNumber: number) => void;
  reconnect_error: (error: Error) => void;
  reconnect_failed: () => void;

  // Custom SFU Events
  newProducer: (data: WSProducer) => void;
  producerClosed: (data: WSProducerClosed) => void;
  clientLeft: (data: WSClientLeft) => void;
  transportConnected: (data: WSTransportConnected) => void;
  transportError: (data: WSTransportError) => void;

  // Client -> Server (Emit)
  getRouterRtpCapabilities: {
    request: {};
    response: any;
  };
  createSendTransport: {
    request: {};
    response: WSTransportData;
  };
  createRecvTransport: {
    request: {};
    response: WSTransportData;
  };
  connectTransport: {
    request: { transportId: string; dtlsParameters: any };
    response: void;
  };
  produce: {
    request: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: any;
      source?: string;
    };
    response: { producerId: string };
  };
  consume: {
    request: {
      transportId: string;
      producerId: string;
      rtpCapabilities: any;
      roomId?: string;
      socketId?: string;
    };
    response: {
      id: string;
      producerId: string;
      kind: 'audio' | 'video';
      rtpParameters: any;
      type?: string;
    };
  };
  pauseProducer: {
    request: { producerId: string };
    response: void;
  };
  resumeProducer: {
    request: { producerId: string };
    response: void;
  };
  pauseConsumer: {
    request: { consumerId: string };
    response: void;
  };
  resumeConsumer: {
    request: { consumerId: string };
    response: void;
  };
  closeProducer: {
    request: { producerId: string };
    response: void;
  };
  closeConsumer: {
    request: { consumerId: string };
    response: void;
  };
}

// ─── Event Handler Types ────────────────────────────────────

type EventCallback<T = any> = (data: T) => void;
type EventMap = {
  [K in keyof WebSocketEvents]?: WebSocketEvents[K] extends (...args: any[]) => any
    ? WebSocketEvents[K]
    : (data: WebSocketEvents[K]) => void;
};

// ─── WebSocket Client Class ─────────────────────────────────

export class WebSocketClient {
  private socket: Socket | null = null;
  private config: Required<WebSocketConfig>;
  private isConnected = false;
  private socketId = '';
  private eventCallbacks: Map<string, EventCallback[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      options: {
        transports: ['websocket', 'polling'],
        ...config.options,
      },
    } as Required<WebSocketConfig>;

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  // ─── Connection ───────────────────────────────────────────

  connect(): void {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = io(this.config.url, {
      ...this.config.options,
      reconnectionAttempts: this.config.reconnectionAttempts,
      reconnectionDelay: this.config.reconnectionDelay,
      reconnectionDelayMax: this.config.reconnectionDelayMax,
    });

    this.setupListeners();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.socketId = '';
  }

  private setupListeners(): void {
    if (!this.socket) return;

    // ─── Built-in Socket.IO Events ─────────────────────────

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.socketId = this.socket?.id || '';
      this.emitEvent('connect');
    });

    this.socket.on('connect_error', (error: Error) => {
      this.emitEvent('connect_error', error);
    });

    this.socket.on('disconnect', (reason: string) => {
      this.isConnected = false;
      this.emitEvent('disconnect', reason);
    });

    this.socket.on('reconnect', (attemptNumber: number) => {
      this.emitEvent('reconnect', attemptNumber);
    });

    this.socket.on('reconnect_attempt', (attemptNumber: number) => {
      this.emitEvent('reconnect_attempt', attemptNumber);
    });

    this.socket.on('reconnect_error', (error: Error) => {
      this.emitEvent('reconnect_error', error);
    });

    this.socket.on('reconnect_failed', () => {
      this.emitEvent('reconnect_failed');
    });

    // ─── Custom SFU Events ──────────────────────────────────

    this.socket.on('newProducer', (data: WSProducer) => {
      this.emitEvent('newProducer', data);
    });

    this.socket.on('producerClosed', (data: WSProducerClosed) => {
      this.emitEvent('producerClosed', data);
    });

    this.socket.on('clientLeft', (data: WSClientLeft) => {
      this.emitEvent('clientLeft', data);
    });

    this.socket.on('transportConnected', (data: WSTransportConnected) => {
      this.emitEvent('transportConnected', data);
    });

    this.socket.on('transportError', (data: WSTransportError) => {
      this.emitEvent('transportError', data);
    });
  }

  // ─── Event Handling ──────────────────────────────────────

  on<K extends keyof EventMap>(
    event: K,
    callback: EventMap[K] extends (...args: any[]) => any
      ? EventMap[K]
      : (data: NonNullable<EventMap[K]>) => void
  ): () => void {
    if (!this.eventCallbacks.has(event as string)) {
      this.eventCallbacks.set(event as string, []);
    }

    const callbacks = this.eventCallbacks.get(event as string)!;
    callbacks.push(callback as EventCallback);

    // Also register with socket.io if it's a built-in event
    if (this.socket && typeof event === 'string') {
      // @ts-ignore - dynamic event registration
      this.socket.on(event as string, callback as EventCallback);
    }

    // Return unsubscribe function
    return () => {
      const idx = callbacks.indexOf(callback as EventCallback);
      if (idx !== -1) {
        callbacks.splice(idx, 1);
      }
      if (this.socket && typeof event === 'string') {
        // @ts-ignore - dynamic event removal
        this.socket.off(event as string, callback as EventCallback);
      }
    };
  }

  private emitEvent<K extends keyof EventMap>(
    event: K,
    data?: any
  ): void {
    const callbacks = this.eventCallbacks.get(event as string) || [];
    callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (error) {
        console.error(`Error in event handler for ${String(event)}:`, error);
      }
    });
  }

  // ─── Emit with Promise ────────────────────────────────────

  emitPromise<T = any, R = any>(
    event: string,
    data?: T
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit(event, data, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });

      // Timeout fallback
      setTimeout(() => {
        reject(new Error(`Emit timeout: ${event}`));
      }, 30000);
    });
  }

  // ─── Typed SFU Methods ────────────────────────────────────

  // async getRouterRtpCapabilities(): Promise<any> {
  //     return this.emitPromise('getRouterRtpCapabilities', {});
  // }
  async getRouterRtpCapabilities(): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!this.socket) {
            reject(new Error('Socket not connected'));
            return;
        }
        
        // ✅ Pass callback to socket.emit
        this.socket.emit('getRouterRtpCapabilities', (response: any) => {
            if (response?.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
        
        // Timeout
        setTimeout(() => {
            reject(new Error('getRouterRtpCapabilities timeout'));
        }, 30000);
    });
}
  async createSendTransport(id:string): Promise<WSTransportData> {
    return this.emitPromise('createSendTransport', {roomId:id});
  }

  async createRecvTransport(id:string): Promise<WSTransportData> {
    return this.emitPromise('createRecvTransport', {roomId:id});
  }

  async connectTransport(
    transportId: string,
    dtlsParameters: any
  ): Promise<void> {
    await this.emitPromise('connectTransport', {
      transportId,
      dtlsParameters,
    });
  }

  async produce(data: {
    transportId: string;
    kind: 'audio' | 'video';
    rtpParameters: any;
    source?: string;
  }): Promise<{ producerId: string }> {
    return this.emitPromise('produce', data);
  }

  async consume(data: {
    transportId: string;
    producerId: string;
    rtpCapabilities: any;
    roomId?: string;
    socketId?: string;
  }): Promise<{
    id: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: any;
    type?: string;
  }> {
    return this.emitPromise('consume', data);
  }

  async pauseProducer(producerId: string): Promise<void> {
    await this.emitPromise('pauseProducer', { producerId });
  }

  async resumeProducer(producerId: string): Promise<void> {
    await this.emitPromise('resumeProducer', { producerId });
  }

  async pauseConsumer(consumerId: string): Promise<void> {
    await this.emitPromise('pauseConsumer', { consumerId });
  }

  async resumeConsumer(consumerId: string): Promise<void> {
    await this.emitPromise('resumeConsumer', { consumerId });
  }

  async closeProducer(producerId: string): Promise<void> {
    await this.emitPromise('closeProducer', { producerId });
  }

  async closeConsumer(consumerId: string): Promise<void> {
    await this.emitPromise('closeConsumer', { consumerId });
  }

  // ─── Getters ──────────────────────────────────────────────

  get connected(): boolean {
    return this.isConnected && this.socket?.connected || false;
  }

  get id(): string {
    return this.socketId || this.socket?.id || '';
  }

  get raw(): Socket | null {
    return this.socket;
  }

  // ─── Reconnection Utilities ──────────────────────────────

  async waitForConnection(timeout: number = 10000): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkConnection = () => {
        if (this.connected) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('Connection timeout'));
          return;
        }

        setTimeout(checkConnection, 100);
      };

      // Also listen for connect event
      const unsubscribe = this.on('connect', () => {
        unsubscribe();
        resolve();
      });

      checkConnection();

      // Cleanup on timeout
      setTimeout(() => {
        unsubscribe();
      }, timeout);
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────

  destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.eventCallbacks.clear();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.socketId = '';
  }
}

// ─── React Hook ─────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

export function useWebSocket(config: WebSocketConfig) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState('');
  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    const client = new WebSocketClient({
      ...config,
      autoConnect: true,
    });

    clientRef.current = client;

    const unsubConnect = client.on('connect', () => {
      setIsConnected(true);
      setSocketId(client.id);
    });

    const unsubDisconnect = client.on('disconnect', () => {
      setIsConnected(false);
      setSocketId('');
    });

    return () => {
      unsubConnect();
      unsubDisconnect();
      client.destroy();
      clientRef.current = null;
    };
  }, [config.url]);

  return {
    client: clientRef.current,
    isConnected,
    socketId,
  };
}