// ============================================================
// SFU TanStack Query Hooks - COMPLETE with initialData
// ============================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
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
} from './types';
import { sfuApi } from './sfu.api';

// ─── Query Keys ─────────────────────────────────────────────

export const sfuKeys = {
  all: ['sfu'] as const,
  status: () => [...sfuKeys.all, 'status'] as const,
  stats: () => [...sfuKeys.all, 'stats'] as const,
  health: () => [...sfuKeys.all, 'health'] as const,
  capabilities: () => [...sfuKeys.all, 'capabilities'] as const,
  rooms: () => [...sfuKeys.all, 'rooms'] as const,
  room: (roomId: string) => [...sfuKeys.rooms(), roomId] as const,
  roomProducers: (roomId: string) => [...sfuKeys.room(roomId), 'producers'] as const,
  roomConsumers: (roomId: string) => [...sfuKeys.room(roomId), 'consumers'] as const,
};

// ─── Query Hooks ────────────────────────────────────────────

export const useSFUStatus = (
  options?: Omit<UseQueryOptions<SFUStatus>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.status(),
    queryFn: () => sfuApi.getStatus(),

    staleTime: 3000,
    // ✅ Provide default empty object
    initialData: {} as SFUStatus,
    ...options,
  });
};

export const useSFUStats = (
  options?: Omit<UseQueryOptions<SFUStats>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.stats(),
    queryFn: () => sfuApi.getStats(),
    refetchInterval: 10000,
    staleTime: 5000,
    initialData: {} as SFUStats,
    ...options,
  });
};

export const useSFUHealth = (
  options?: Omit<UseQueryOptions<SFUHealth>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.health(),
    queryFn: () => sfuApi.getHealth(),
    refetchInterval: 15000,
    staleTime: 5000,
    initialData: {} as SFUHealth,
    ...options,
  });
};

export const useRtpCapabilities = (
  options?: Omit<UseQueryOptions<RtpCapabilities>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.capabilities(),
    queryFn: () => sfuApi.getCapabilities(),
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: { capabilities: { codecs: [], headerExtensions: [] }, timestamp: '' },
    ...options,
  });
};

// ✅ FIXED: Add initialData as empty array
export const useRooms = (
  options?: Omit<UseQueryOptions<Room[]>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.rooms(),
    queryFn: () => sfuApi.getRooms(),

    staleTime: 15000,
    initialData: [], // ✅ This ensures rooms is always an array
    ...options,
  });
};

export const useRoom = (
  roomId: string,
  options?: Omit<UseQueryOptions<RoomDetail>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.room(roomId),
    queryFn: () => sfuApi.getRoom(roomId),
    enabled: !!roomId,
    refetchInterval: 15000,
    staleTime: 10000,
    initialData: {} as RoomDetail,
    ...options,
  });
};

export const useRoomProducers = (
  roomId: string,
  options?: Omit<UseQueryOptions<ProducerList>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.roomProducers(roomId),
    queryFn: () => sfuApi.getRoomProducers(roomId),
    enabled: !!roomId,
    refetchInterval: 15000,
    staleTime: 10000,
    initialData: { roomId, producers: [], total: 0 },
    ...options,
  });
};

export const useRoomConsumers = (
  roomId: string,
  options?: Omit<UseQueryOptions<ConsumerList>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    queryKey: sfuKeys.roomConsumers(roomId),
    queryFn: () => sfuApi.getRoomConsumers(roomId),
    enabled: !!roomId,
    refetchInterval: 15000,
    staleTime: 10000,
    initialData: { roomId, consumers: [], total: 0 },
    ...options,
  });
};

// ─── Mutation Hooks ─────────────────────────────────────────

export const useStartSFU = (
  options?: UseMutationOptions<SFUStartResponse, Error, SFUStartRequest>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SFUStartRequest) => sfuApi.startSFU(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.status() });
      queryClient.invalidateQueries({ queryKey: sfuKeys.stats() });
      queryClient.invalidateQueries({ queryKey: sfuKeys.health() });
    },
    ...options,
  });
};

export const useStopSFU = (
  options?: UseMutationOptions<SFUStopResponse, Error>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sfuApi.stopSFU(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.status() });
      queryClient.invalidateQueries({ queryKey: sfuKeys.stats() });
      queryClient.invalidateQueries({ queryKey: sfuKeys.health() });
      queryClient.invalidateQueries({ queryKey: sfuKeys.rooms() });
    },
    ...options,
  });
};

export const useRestartSFU = (
  options?: UseMutationOptions<SFURestartResponse, Error, SFURestartRequest>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SFURestartRequest) => sfuApi.restartSFU(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.all });
    },
    ...options,
  });
};

export const useResetSFU = (
  options?: UseMutationOptions<SFUResetResponse, Error>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sfuApi.resetSFU(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.all });
    },
    ...options,
  });
};

export const useCreateRoom = (
  options?: UseMutationOptions<CreateRoomResponse, Error, CreateRoomRequest>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoomRequest) => sfuApi.createRoom(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.rooms() });
      queryClient.invalidateQueries({ queryKey: sfuKeys.room(variables.roomId) });
    },
    ...options,
  });
};

export const useDeleteRoom = (
  options?: UseMutationOptions<{ deleted: boolean }, Error, string>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => sfuApi.deleteRoom(roomId),
    onSuccess: (_, roomId) => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.rooms() });
      queryClient.removeQueries({ queryKey: sfuKeys.room(roomId) });
    },
    ...options,
  });
};

export const useForceCloseProducer = (
  options?: UseMutationOptions<{ closed: boolean }, Error, string>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (producerId: string) => sfuApi.forceCloseProducer(producerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.rooms() });
    },
    ...options,
  });
};

export const useForceCloseConsumer = (
  options?: UseMutationOptions<{ closed: boolean }, Error, string>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (consumerId: string) => sfuApi.forceCloseConsumer(consumerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sfuKeys.rooms() });
    },
    ...options,
  });
};