// src/pages/TestRtc/query.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roomApi, peerApi, trackApi, signalingApi, statsApi } from './api';
import type { RoomCreate, PeerCreate } from './types';
import { toast } from 'react-toastify';

// ============================================================
// QUERY KEYS
// ============================================================

export const queryKeys = {
  stats: ['webrtc', 'stats'],
  rooms: ['webrtc', 'rooms'],
  room: (roomId: string) => ['webrtc', 'rooms', roomId],
  roomStats: (roomId: string) => ['webrtc', 'rooms', roomId, 'stats'],
  peer: (peerId: string) => ['webrtc', 'peers', peerId],
  peerStats: (peerId: string) => ['webrtc', 'peers', peerId, 'stats'],
  tracks: (peerId: string) => ['webrtc', 'peers', peerId, 'tracks'],
  connection: (peerA: string, peerB: string) => ['webrtc', 'connection', peerA, peerB],
};

// ============================================================
// QUERY HOOKS
// ============================================================

export const useStats = () => useQuery({
  queryKey: queryKeys.stats,
  queryFn: statsApi.get,
  refetchInterval: 30000,
});

export const useRooms = () => useQuery({
  queryKey: queryKeys.rooms,
  queryFn: roomApi.list,
});

export const useRoom = (roomId: string) => useQuery({
  queryKey: queryKeys.room(roomId),
  queryFn: () => roomApi.get(roomId),
  enabled: !!roomId,
});

export const useRoomStats = (roomId: string) => useQuery({
  queryKey: queryKeys.roomStats(roomId),
  queryFn: () => roomApi.stats(roomId),
  enabled: !!roomId,
});

export const usePeer = (peerId: string) => useQuery({
  queryKey: queryKeys.peer(peerId),
  queryFn: () => peerApi.get(peerId),
  enabled: !!peerId,
});

export const usePeerStats = (peerId: string) => useQuery({
  queryKey: queryKeys.peerStats(peerId),
  queryFn: () => peerApi.stats(peerId),
  enabled: !!peerId,
});

export const useTracks = (peerId: string) => useQuery({
  queryKey: queryKeys.tracks(peerId),
  queryFn: () => trackApi.list(peerId),
  enabled: !!peerId,
});

// ============================================================
// MUTATION HOOKS
// ============================================================

export const useCreateRoom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roomApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
      toast.success('Room created successfully');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to create room'),
  });
};

export const useDeleteRoom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: roomApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
      toast.success('Room deleted');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to delete room'),
  });
};

export const useCreatePeer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: PeerCreate }) =>
      peerApi.create(roomId, data),
    onSuccess: (_, { roomId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.room(roomId) });
      toast.success('Peer created');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to create peer'),
  });
};

export const useDeletePeer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: peerApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webrtc'] });
      toast.success('Peer disconnected');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to disconnect peer'),
  });
};

export const useCreateOffer = () => {
  return useMutation({
    mutationFn: signalingApi.createOffer,
    onSuccess: (data) => {
      toast.success('Offer created');
      return data;
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to create offer'),
  });
};

export const useHandleOffer = () => {
  return useMutation({
    mutationFn: ({ peerId, sdp }: { peerId: string; sdp: string }) =>
      signalingApi.handleOffer(peerId, sdp),
    onSuccess: () => toast.success('Offer handled'),
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to handle offer'),
  });
};

export const useHandleAnswer = () => {
  return useMutation({
    mutationFn: ({ peerId, sdp }: { peerId: string; sdp: string }) =>
      signalingApi.handleAnswer(peerId, sdp),
    onSuccess: () => toast.success('Answer handled'),
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to handle answer'),
  });
};

export const useAutoConnect = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signalingApi.autoConnect,
    onSuccess: (data) => {
      toast.success(data.success ? 'Peers connected' : 'Connection failed');
      queryClient.invalidateQueries({ queryKey: ['webrtc'] });
      return data;
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Auto-connect failed'),
  });
};

export const useCheckConnection = () => {
  return useMutation({
    mutationFn: ({ peerA, peerB }: { peerA: string; peerB: string }) =>
      signalingApi.checkConnection(peerA, peerB),
    onSuccess: (data) => {
      toast.info(data.connected ? '✅ Peers are connected!' : '❌ Peers are not connected');
      return data;
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to check connection'),
  });
};

export const useEnableTrack = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ peerId, trackId, enabled }: { peerId: string; trackId: string; enabled: boolean }) =>
      trackApi.enable(peerId, trackId, enabled),
    onSuccess: (_, { peerId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tracks(peerId) });
      toast.success('Track updated');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to update track'),
  });
};

export const useRemoveTrack = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ peerId, trackId }: { peerId: string; trackId: string }) =>
      trackApi.remove(peerId, trackId),
    onSuccess: (_, { peerId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tracks(peerId) });
      toast.success('Track removed');
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to remove track'),
  });
};

export const useCancelOffer = () => {
  return useMutation({
    mutationFn: signalingApi.cancelOffer,
    onSuccess: () => toast.success('Offer canceled'),
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to cancel offer'),
  });
};

export const useEndCall = () => {
  return useMutation({
    mutationFn: signalingApi.endCall,
    onSuccess: () => toast.success('Call ended'),
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to end call'),
  });
};

export const useRejectCall = () => {
  return useMutation({
    mutationFn: signalingApi.rejectCall,
    onSuccess: () => toast.success('Call rejected'),
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Failed to reject call'),
  });
};

export const useCallState = (peerId: string, enabled: boolean = true) => useQuery({
  queryKey: ['webrtc', 'call-state', peerId],
  queryFn: () => signalingApi.getCallState(peerId),
  enabled: !!peerId && enabled,
  refetchInterval: 2000, // Poll every 2 seconds for state changes
});