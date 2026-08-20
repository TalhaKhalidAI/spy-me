// src/pages/TestRtc/types.ts

// ============================================================
// ROOM TYPES
// ============================================================

export interface Room {
  room_id: string;
  peer_count: number;
  created_at: string;
  password_protected: boolean;
  peers?: Peer[];
}

export interface RoomCreate {
  room_id: string;
  password?: string;
}

export interface RoomStats {
  room_id: string;
  peer_count: number;
  max_peers: number;
  peers: Array<{
    peer_id: string;
    role: string;
    track_count: number;
    connected_seconds: number;
  }>;
}

// ============================================================
// PEER TYPES
// ============================================================

export interface Peer {
  peer_id: string;
  room_id: string;
  role: string;
  track_count: number;
  connected_at: string;
  last_heartbeat?: string;
  disconnected?: boolean;
  connection_state?: string;
  ice_state?: string;
  tracks?: Track[];
}

export interface PeerCreate {
  peer_id?: string;
  role?: 'publisher' | 'subscriber' | 'both';
  password?: string;
}

export interface PeerStats {
  timestamp: number;
  stats: Array<{
    type: string;
    timestamp: number;
    bytes_sent?: number;
    bytes_received?: number;
    packets_sent?: number;
    packets_received?: number;
    packets_lost?: number;
    round_trip_time?: number;
    frames_per_second?: number;
  }>;
}

// ============================================================
// TRACK TYPES
// ============================================================

export interface Track {
  track_id: string;
  kind: 'audio' | 'video';
  peer_id: string;
  enabled: boolean;
}

// ============================================================
// SIGNALING TYPES
// ============================================================

export interface SDPRequest {
  sdp: string;
  sdp_type: 'offer' | 'answer';
}

export interface SDPResponse {
  success: boolean;
  sdp: string;
  sdp_type: string;
}

export interface ICEOffer {
  candidate: any;
}

export interface OfferRequest {
  peer_a_id: string;
  target_peer_id: string;
}

export interface AutoConnectResult {
  success: boolean;
  peer_a: string;
  peer_b: string;
  room_id: string;
  offer?: SDPResponse;
  answer?: SDPResponse;
  error?: string;
}

// ============================================================
// CONNECTION STATUS TYPES
// ============================================================

export interface ConnectionStatus {
  peer_a_id: string;
  peer_b_id: string;
  same_room: boolean;
  peer_a_connected: boolean;
  peer_b_connected: boolean;
  peer_a_state: string;
  peer_b_state: string;
  peer_a_ice_state: string;
  peer_b_ice_state: string;
  sdp_exchanged: boolean;
  ice_complete: boolean;
  has_tracks: boolean;
  connected: boolean;
  peer_a_room: string;
  peer_b_room: string;
  peer_a_track_count: number;
  peer_b_track_count: number;
}

// ============================================================
// STATS TYPES
// ============================================================

export interface Stats {
  total_rooms: number;
  total_peers: number;
  total_tracks: number;
  max_peers: number;
}