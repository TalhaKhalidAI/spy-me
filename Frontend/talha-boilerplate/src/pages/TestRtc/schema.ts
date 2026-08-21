// src/pages/TestRtc/schema.ts

import { z } from 'zod';

export const roomCreateSchema = z.object({
  room_id: z
    .string()
    .min(3, 'Room ID must be at least 3 characters')
    .max(50, 'Room ID must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Room ID can only contain letters, numbers, underscores, and hyphens'),
  password: z.string().min(4, 'Password must be at least 4 characters').max(50).optional(),
});

export const peerCreateSchema = z.object({
  peer_id: z.string().min(3, 'Peer ID must be at least 3 characters').max(50).optional(),
  role: z.enum(['publisher', 'subscriber', 'both']).default('both'),
  password: z.string().optional(),
});

export const sdpRequestSchema = z.object({
  sdp: z.string().min(10, 'SDP must be at least 10 characters'),
  sdp_type: z.enum(['offer', 'answer']),
});

export const iceCandidateSchema = z.object({
  candidate: z.any(),
});

export const offerRequestSchema = z.object({
  peer_a_id: z.string().min(1, 'Peer A ID is required'),
  target_peer_id: z.string().min(1, 'Target peer ID is required'),
});

export type RoomCreateForm = z.infer<typeof roomCreateSchema>;
export type PeerCreateForm = z.infer<typeof peerCreateSchema>;
export type SDPRequestForm = z.infer<typeof sdpRequestSchema>;