// ============================================================
// SFU API Service - with proxy support
// ============================================================

import type {
  Room,
  RoomDetail,
  CreateRoomRequest,
  CreateRoomResponse,
  ProducerList,
  ConsumerList,
  SFUStatus,
  SFUStats,
  SFUHealth,
  SFUStartRequest,
  SFUStartResponse,
  SFUStopResponse,
  SFURestartRequest,
  SFURestartResponse,
  SFUResetResponse,
  RtpCapabilities,
  ApiResponse,
} from './types';

// ✅ Use relative path - Vite proxy will handle it
const API_BASE = '/api/v1';

// ─── Base API Client ────────────────────────────────────────

const apiClient = async <T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> => {
  const url = `${API_BASE}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    // ✅ Handle 503 gracefully (SFU not running)
    if (response.status === 503) {
      if (endpoint.includes('/rooms') && !endpoint.includes('/rooms/')) {
        return [] as T;
      }
      return {} as T;
    }

    // ✅ Parse response
    const rawData = await response.json();
    
    // ✅ Handle different response structures
    // Case 1: { status: 'success', data: [...] }
    // Case 2: { data: [...] }
    // Case 3: [...] (direct array)
    let data: T;
    
    if (Array.isArray(rawData)) {
      // Direct array
      data = rawData as T;
    } else if (rawData.data !== undefined) {
      // Has 'data' property
      data = rawData.data as T;
    } else {
      // Fallback - use raw data
      data = rawData as T;
    }

    if (!response.ok || rawData.status === 'fail' || rawData.status === 'error') {
      throw new Error(rawData.message || `API Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error: ${endpoint}`, error);
    
    // ✅ Return empty data on error for list endpoints
    if (endpoint.includes('/rooms') && !endpoint.includes('/rooms/')) {
      return [] as T;
    }
    
    if (endpoint.includes('/health') || endpoint.includes('/stats') || endpoint.includes('/status')) {
      return {} as T;
    }
    
    throw error;
  }
};

// ─── SFU API ────────────────────────────────────────────────

export const sfuApi = {
  // ─── Status ──────────────────────────────────────────────
  getStatus: (): Promise<SFUStatus> =>
    apiClient('/sfu/status'),

  getStats: (): Promise<SFUStats> =>
    apiClient('/sfu/stats'),

  getHealth: (): Promise<SFUHealth> =>
    apiClient('/sfu/health'),

  getCapabilities: (): Promise<RtpCapabilities> =>
    apiClient('/sfu/capabilities'),

  // ─── Control ──────────────────────────────────────────────
  startSFU: (data: SFUStartRequest = {}): Promise<SFUStartResponse> =>
    apiClient('/sfu/start', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  stopSFU: (): Promise<SFUStopResponse> =>
    apiClient('/sfu/stop', {
      method: 'POST',
    }),

  restartSFU: (data: SFURestartRequest = {}): Promise<SFURestartResponse> =>
    apiClient('/sfu/restart', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resetSFU: (): Promise<SFUResetResponse> =>
    apiClient('/sfu/reset', {
      method: 'POST',
    }),

  // ─── Rooms ────────────────────────────────────────────────
  getRooms: (): Promise<Room[]> =>
    apiClient('/sfu/rooms'),

  getRoom: (roomId: string): Promise<RoomDetail> =>
    apiClient(`/sfu/rooms/${roomId}`),

  createRoom: (data: CreateRoomRequest): Promise<CreateRoomResponse> =>
    apiClient('/sfu/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteRoom: (roomId: string): Promise<{ deleted: boolean }> =>
    apiClient(`/sfu/rooms/${roomId}`, {
      method: 'DELETE',
    }),

  // ─── Producers ─────────────────────────────────────────────
  getRoomProducers: (roomId: string): Promise<ProducerList> =>
    apiClient(`/sfu/rooms/${roomId}/producers`),

  forceCloseProducer: (producerId: string): Promise<{ closed: boolean }> =>
    apiClient(`/sfu/producers/${producerId}`, {
      method: 'DELETE',
    }),

  // ─── Consumers ─────────────────────────────────────────────
  getRoomConsumers: (roomId: string): Promise<ConsumerList> =>
    apiClient(`/sfu/rooms/${roomId}/consumers`),

  forceCloseConsumer: (consumerId: string): Promise<{ closed: boolean }> =>
    apiClient(`/sfu/consumers/${consumerId}`, {
      method: 'DELETE',
    }),
};