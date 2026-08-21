// src/pages/TestRtc/api.ts

import { apiHelper } from '@/api/http/axosMethod';
import type {
  Room,
  RoomCreate,
  RoomStats,
  Peer,
  PeerCreate,
  PeerStats,
  Track,
  SDPRequest,
  SDPResponse,
  ICEOffer,
  OfferRequest,
  AutoConnectResult,
  ConnectionStatus,
  Stats,
} from './types';

const BASE = '/webrtc';

// ============================================================
// ROOM APIs
// ============================================================

export const roomApi = {
  list: () => apiHelper.get<{ rooms: string[]; total: number }>(`${BASE}/rooms`),
  
  get: (roomId: string) => apiHelper.get<Room>(`${BASE}/rooms/${roomId}`),
  
  create: (data: RoomCreate) => apiHelper.post<Room>(`${BASE}/rooms`, data),
  
  delete: (roomId: string) => apiHelper.delete(`${BASE}/rooms/${roomId}`),
  
  stats: (roomId: string) => apiHelper.get<RoomStats>(`${BASE}/rooms/${roomId}/stats`),
};

// ============================================================
// PEER APIs
// ============================================================

export const peerApi = {
  create: (roomId: string, data: PeerCreate) =>
    apiHelper.post<{ success: boolean; peer_id: string; room_id: string; role: string }>(
      `${BASE}/rooms/${roomId}/peers`,
      data
    ),
  
  get: (peerId: string) => apiHelper.get<Peer>(`${BASE}/peers/${peerId}`),
  
  delete: (peerId: string) => apiHelper.delete(`${BASE}/peers/${peerId}`),
  
  stats: (peerId: string) => apiHelper.get<PeerStats>(`${BASE}/peers/${peerId}/stats`),
  
  heartbeat: (peerId: string) => apiHelper.post(`${BASE}/peers/${peerId}/heartbeat`),
  
  renegotiate: (peerId: string) => apiHelper.post<{ success: boolean; sdp: string; type: string }>(
    `${BASE}/peers/${peerId}/renegotiate`
  ),
};

// ============================================================
// TRACK APIs
// ============================================================

export const trackApi = {
  list: (peerId: string) => apiHelper.get<{ tracks: Track[]; count: number }>(
    `${BASE}/peers/${peerId}/tracks`
  ),
  
  enable: (peerId: string, trackId: string, enabled: boolean) =>
    apiHelper.post(`${BASE}/peers/${peerId}/tracks/${trackId}/enable?enabled=${enabled}`),
  
  remove: (peerId: string, trackId: string) =>
    apiHelper.delete(`${BASE}/peers/${peerId}/tracks/${trackId}`),
};

// ============================================================
// SIGNALING APIs
// ============================================================

export const signalingApi = {
  createOffer: (peerId: string) => apiHelper.post<SDPResponse>(`${BASE}/peers/${peerId}/offer`),
  
  handleOffer: (peerId: string, sdp: string) =>
    apiHelper.post<SDPResponse>(`${BASE}/peers/${peerId}/offer/handle`, { sdp }),
  
  handleAnswer: (peerId: string, sdp: string) =>
    apiHelper.post(`${BASE}/peers/${peerId}/answer`, { sdp, sdp_type: 'answer' }),
  
  addIce: (peerId: string, candidate: any) =>
    apiHelper.post(`${BASE}/peers/${peerId}/ice`, { candidate }),
  
  autoConnect: (data: OfferRequest) =>
    apiHelper.post<AutoConnectResult>(`${BASE}/connect`, data),
  
  checkConnection: (peerA: string, peerB: string) =>
    apiHelper.get<ConnectionStatus>(`${BASE}/peers/${peerA}/connected/${peerB}`),

  // Call management endpoints
  cancelOffer: (peerId: string) => 
    apiHelper.post(`${BASE}/peers/${peerId}/cancel-offer`),
    
  endCall: (peerId: string) => 
    apiHelper.post(`${BASE}/peers/${peerId}/end-call`),
    
  rejectCall: (peerId: string) => 
    apiHelper.post(`${BASE}/peers/${peerId}/reject-call`),
    
  getCallState: (peerId: string) => 
    apiHelper.get<{ state: string }>(`${BASE}/peers/${peerId}/call-state`),
};

// ============================================================
// STATS API
// ============================================================

export const statsApi = {
  get: () => apiHelper.get<Stats>(`${BASE}/stats`),
};