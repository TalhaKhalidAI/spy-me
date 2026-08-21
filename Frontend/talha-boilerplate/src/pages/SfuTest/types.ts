// ============================================================
// Additional SFU Types
// ============================================================

// ─── Stats Types ─────────────────────────────────────────────

export interface SFUStats {
  sfu: {
    initialized: boolean;
    workers: number;
    routers: number;
    transports: number;
    producers: number;
    consumers: number;
  };
  workers: Array<{
    pid: number;
    alive: boolean;
    closed: boolean;
  }>;
  transports: Array<{
    id: string;
    direction: string;
    roomId: string;
    alive: boolean;
    iceState: string;
    dtlsState: string;
  }>;
  timestamp: string;
}

// ─── Health Types ────────────────────────────────────────────

export interface SFUHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  sfu: {
    initialized: boolean;
  };
  workers: {
    healthy: boolean;
    totalWorkers: number;
    details: Array<{
      pid: number;
      alive: boolean;
      closed: boolean;
    }>;
  };
  transports: {
    healthy: boolean;
    totalTransports: number;
    details: Array<{
      id: string;
      alive: boolean;
      iceState: string;
      dtlsState: string;
    }>;
  };
  producers: {
    healthy: boolean;
    totalProducers: number;
    details: Array<{
      id: string;
      kind: string;
      source: string;
      alive: boolean;
      paused: boolean;
    }>;
  };
  consumers: {
    healthy: boolean;
    totalConsumers: number;
    details: Array<{
      id: string;
      kind: string;
      producerId: string;
      alive: boolean;
      paused: boolean;
    }>;
  };
  timestamp: string;
}

// ─── Capabilities Types ─────────────────────────────────────

export interface RtpCapabilities {
  capabilities: {
    codecs: any[];
    headerExtensions: any[];
  };
  timestamp: string;
}

// ─── Reset Types ─────────────────────────────────────────────

export interface SFUResetResponse {
  reset: boolean;
  timestamp: string;
}