// ============================================================
// Zod Schemas for Validation
// ============================================================

import { z } from 'zod';

// ─── Room Schemas ───────────────────────────────────────────

export const createRoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  options: z.object({
    mediaCodecs: z.array(z.any()).optional(),
  }).optional(),
});

export const roomIdSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
});

// ─── SFU Control Schemas ───────────────────────────────────

// ✅ FIXED: Removed .ip() and used .regex() instead
const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const startSFUSchema = z.object({
  listenIp: z.string().regex(ipRegex, 'Invalid IP address').default('0.0.0.0'),
  announcedIp: z.string().regex(ipRegex, 'Invalid IP address').default('127.0.0.1'),
});

export const restartSFUSchema = z.object({
  listenIp: z.string().regex(ipRegex, 'Invalid IP address').default('0.0.0.0'),
  announcedIp: z.string().regex(ipRegex, 'Invalid IP address').default('127.0.0.1'),
});

// ─── Producer/Consumer Schemas ─────────────────────────────

export const producerIdSchema = z.object({
  producerId: z.string().uuid('Invalid producer ID'),
});

export const consumerIdSchema = z.object({
  consumerId: z.string().uuid('Invalid consumer ID'),
});

// ─── Type inference ─────────────────────────────────────────

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type RoomIdInput = z.infer<typeof roomIdSchema>;
export type StartSFUInput = z.infer<typeof startSFUSchema>;
export type RestartSFUInput = z.infer<typeof restartSFUSchema>;
export type ProducerIdInput = z.infer<typeof producerIdSchema>;
export type ConsumerIdInput = z.infer<typeof consumerIdSchema>;