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

import { useAuthStore } from '../../store/authStore';

// ✅ Use relative path - Vite proxy will handle it
const API_BASE = '/api/v1';

// ─── Base API Client ────────────────────────────────────────

const apiClient = async <T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> => {
  const url = `${API_BASE}${endpoint}`;

  const token = useAuthStore.getState().token;
  console.log(`[apiClient] Fetching ${url} | Token exists?`, !!token);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    };

    console.log(`[apiClient] Headers for ${url}:`, headers);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // ✅ Handle 503 (SFU not running) & 429 (Rate limited) gracefully
    if (response.status === 503 || response.status === 429) {
      if (endpoint.includes('/rooms') && !endpoint.includes('/rooms/')) {
        return [] as T;
      }
      if (endpoint.includes('/producers')) {
        return { producers: [], total: 0 } as T;
      }
      if (endpoint.includes('/consumers')) {
        return { consumers: [], total: 0 } as T;
      }
      return {} as T;
    }

    if (!response.ok) {
      // Handle plain text errors like 'Unauthorized'
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorText;
      } catch (e) {
        // Not JSON, use raw text
      }
      throw new Error(`HTTP ${response.status}: ${errorMessage}`);
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
  // ─── Auth ──────────────────────────────────────────────────
  generatePermanentToken: (): Promise<{ token: string; message: string; note: string }> =>
    apiClient('/auth/permanent-token', {
      method: 'POST',
    }),

  // ─── Status ──────────────────────────────────────────────
  getStatus: (): Promise<SFUStatus> =>
    apiClient('/sfu/status'),

  getStats: (): Promise<SFUStats> =>
    apiClient('/sfu/stats'),

  getHealth: async (): Promise<SFUHealth> => {
    const url = '/health';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return response.json();
  },

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
  getRooms: async (): Promise<Room[]> => {
    const data: any = await apiClient('/rooms');

    // Check if the backend returned the grouped format { "userId": ["room1", "room2"] }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (data.rooms) return data.rooms;
      if (data.data) return data.data;

      const rooms: Room[] = [];
      Object.values(data).forEach((userRooms: any) => {
        if (Array.isArray(userRooms)) {
          // Fallback if backend still returns array of IDs
          userRooms.forEach((id: string) => {
            rooms.push({ id, roomId: id, name: id } as unknown as Room);
          });
        } else if (typeof userRooms === 'object') {
          // Detailed format: { "roomId1": { name: "...", ... } }
          Object.entries(userRooms).forEach(([roomId, details]: [string, any]) => {
            rooms.push({
              id: roomId,
              roomId,
              ...details
            });
          });
        }
      });
      return rooms;
    }

    return Array.isArray(data) ? data : [];
  },

  getRoomsWithToken: async (token: string | null): Promise<Room[]> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${API_BASE}/rooms`;
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const rawData = await response.json();
    const data = rawData?.data ?? rawData;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (data.rooms) return data.rooms;
      if (data.data) return data.data;
      const rooms: Room[] = [];
      Object.values(data).forEach((userRooms: any) => {
        if (Array.isArray(userRooms)) {
          userRooms.forEach((id: string) => rooms.push({ id, roomId: id, name: id } as unknown as Room));
        } else if (typeof userRooms === 'object') {
          Object.entries(userRooms).forEach(([roomId, details]: [string, any]) => {
            rooms.push({ id: roomId, roomId, ...details });
          });
        }
      });
      return rooms;
    }
    return Array.isArray(data) ? data : [];
  },

  getRoom: async (roomId: string): Promise<RoomDetail> => {
    const rawData = await apiClient(`/rooms?id=${roomId}`);
    // The backend returns `{ "USER_ID": { "roomId": { ...details } } }`
    if (rawData && typeof rawData === 'object') {
      for (const userId of Object.keys(rawData)) {
        if (rawData[userId] && rawData[userId][roomId]) {
          return rawData[userId][roomId] as RoomDetail;
        }
      }
    }
    return rawData as any;
  },

  createRoom: (data: CreateRoomRequest): Promise<CreateRoomResponse> =>
    apiClient('/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRoom: (roomId: string, data: { name?: string; description?: string }): Promise<RoomDetail> =>
    apiClient(`/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRoom: (roomId: string): Promise<{ deleted: boolean }> =>
    apiClient(`/rooms/${roomId}`, {
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

  forceCloseConsumer: (producerId: string): Promise<{ closed: boolean }> =>
    apiClient(`/sfu/consumers/${producerId}`, {
      method: 'DELETE',
    }),

  // ─── Users & Permissions ──────────────────────────────────
  getUsersWithPermissions: (): Promise<any[]> =>
    apiClient('/users/permissions', {
      method: 'GET',
    }),

  getAllPermissions: (): Promise<any[]> =>
    apiClient('/permissions', {
      method: 'GET',
    }),

  createPermission: (data: { name: string; description?: string }): Promise<any> =>
    apiClient('/permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePermission: (id: string, data: { name: string; description?: string }): Promise<any> =>
    apiClient(`/permissions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePermission: (id: string): Promise<any> =>
    apiClient(`/permissions/${id}`, {
      method: 'DELETE',
    }),

  addPermissionToUser: (userId: string, permissionId: string): Promise<any> =>
    apiClient(`/users/${userId}/permissions/${permissionId}`, {
      method: 'POST',
    }),

  removePermissionFromUser: (userId: string, permissionId: string): Promise<any> =>
    apiClient(`/users/${userId}/permissions/${permissionId}`, {
      method: 'DELETE',
    }),

  addGrantedRoom: (userId: string, roomId: string): Promise<any> =>
    apiClient(`/users/${userId}/granted-rooms/${roomId}`, {
      method: 'POST',
    }),

  removeGrantedRoom: (userId: string, roomId: string): Promise<any> =>
    apiClient(`/users/${userId}/granted-rooms/${roomId}`, {
      method: 'DELETE',
    }),
};