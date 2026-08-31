import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Table from './components/Table';
import {
  useRooms,
  useDeleteRoom,
  useCreateRoom,
  useForceCloseConsumer,
  useForceCloseProducer,
  useRoom,
  useRoomProducers,
  useRoomConsumers,
  useSFUStatus,
  useStartSFU,
  useStopSFU,
  useRestartSFU,
  useUsersList,
  useAllPermissions,
  useAssignPermission,
  useRemovePermission,
  useCreatePermission,
  useUpdatePermission,
  useDeletePermission,
  useAddGrantedRoom,
  useRemoveGrantedRoom
} from './query';
import { sfuApi } from './sfu.api';
import { createRoomSchema, CreateRoomInput } from './schema';
import { WebSocketClient } from '@/utils/websocket';
import { Device } from 'mediasoup-client';
import { ToastMsgs } from '@/api/toastUtils';
import { useAuthStore, refreshUserSession } from '@/store/authStore';

const getIceServers = () => {
  try {
    if (import.meta.env.VITE_ICE_SERVERS) {
      console.log("got local ice ")
      return JSON.parse(import.meta.env.VITE_ICE_SERVERS);
    }
  } catch (e) {
    console.error('Failed to parse VITE_ICE_SERVERS env variable', e);
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];
};

// ─── Video Modal Component ──────────────────────────────────
interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  remoteStreams: Map<string, MediaStream>;
  peerNames: Record<string, string>;
  roomProducers?: any[];
  isCallActive: boolean;
  onEndCall: () => void;
  onReconnect?: () => void;
  onRemoteAction?: (event: string, targetSocketId?: string, payload?: any) => void;
}

const VideoModal = ({
  isOpen,
  onClose,
  roomId,
  remoteStreams,
  peerNames,
  roomProducers = [],
  isCallActive,
  onEndCall,
  onReconnect,
  onRemoteAction
}: VideoModalProps) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  
  const hasPerm = (perm: string) => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    return user.permissions?.some((p: any) => p.name === perm || p === perm) || false;
  };

  if (!isOpen) return null;

  const remoteCount = remoteStreams.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-[#0f0f13] border border-white/10 rounded-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-b border-white/5 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wider">SECURE FEED</h2>
              <p className="text-xs text-blue-300/70 font-mono uppercase">NODE: {roomId}</p>
            </div>
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isCallActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'} text-xs font-bold uppercase tracking-widest`}>
              <div className={`w-2 h-2 rounded-full ${isCallActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
              {isCallActive ? 'Uplink Active' : 'Offline'}
            </div>
            <button className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={onClose}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0c]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Empty state */}
            {remoteCount === 0 && isCallActive && (
              <div className="col-span-full h-80 bg-black/40 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-white/5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="w-16 h-16 mb-4 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                </div>
                <h3 className="text-white font-bold text-lg mb-1">Awaiting Telemetry</h3>
                <p className="text-gray-500 text-sm mb-6">No active incoming video streams detected.</p>
                {onReconnect && (
                  <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]" onClick={onReconnect}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Refresh Uplink
                  </button>
                )}
              </div>
            )}

            {/* Remote Videos */}
            {Array.from(remoteStreams.entries()).map(([streamKey, stream]) => {
              const peerSocketId = streamKey.split('-')[0];
              const streamSource = streamKey.split('-')[1] || 'camera';
              return (
              <div key={streamKey} tabIndex={0} className="group bg-black rounded-2xl overflow-hidden aspect-video relative border border-white/10 shadow-lg ring-1 ring-white/5 hover:ring-blue-500/50 focus:outline-none focus:ring-blue-500/50 transition-all cursor-pointer">
                <video
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      el.srcObject = stream;
                      el.play().catch(() => { });
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Overlays */}
                <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start">
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    <span className="text-white text-xs font-bold tracking-wide">
                      {peerNames[peerSocketId] || `${peerSocketId.slice(0, 8)}...`} {streamSource === 'screen' ? '(Screen)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-emerald-500/20 backdrop-blur-md px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                    Sync
                  </div>
                </div>

                {/* Per-User Actions Hover */}
                {onRemoteAction && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex flex-col justify-center p-4 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                    <div className="grid grid-cols-2 gap-2 w-full max-w-xs mx-auto">
                      <button className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-blue-500/20 hover:text-blue-400 text-gray-300 text-xs font-bold transition-colors border border-white/5 ${!isAdmin && !hasPerm('permission.peer.refresh') ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.refresh')) { ToastMsgs.error('❌ Check permission: permission.peer.refresh'); return; } onRemoteAction('refreshPage', peerSocketId); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Refresh
                      </button>
                      <button className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 text-gray-300 text-xs font-bold transition-colors border border-white/5 ${!isAdmin && !hasPerm('permission.peer.kick') ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.kick')) { ToastMsgs.error('❌ Check permission: permission.peer.kick'); return; } onRemoteAction('closeTab', peerSocketId); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        Kick
                      </button>
                      <button className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-amber-500/20 hover:text-amber-400 text-gray-300 text-xs font-bold transition-colors border border-white/5 ${!isAdmin && !hasPerm('permission.peer.cam') ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.cam')) { ToastMsgs.error('❌ Check permission: permission.peer.cam'); return; } onRemoteAction('toggleCamera', peerSocketId); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        Cam
                      </button>
                      <button className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-amber-500/20 hover:text-amber-400 text-gray-300 text-xs font-bold transition-colors border border-white/5 ${!isAdmin && !hasPerm('permission.peer.mic') ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.mic')) { ToastMsgs.error('❌ Check permission: permission.peer.mic'); return; } onRemoteAction('toggleMic', peerSocketId); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        Mic
                      </button>
                      {(isAdmin || hasPerm('permission.peer.screen')) && (
                        <button className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-emerald-500/20 hover:text-emerald-400 text-gray-300 text-xs font-bold transition-colors border border-white/5" onClick={() => onRemoteAction('toggleScreen', peerSocketId)}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          Screen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>

        {/* Room-wide Controls & Footer */}
        <div className="bg-[#111115] border-t border-white/5 p-5 shrink-0">

          {onRemoteAction && (
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mr-2">Global Override</span>

              <button className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold transition-all ${!isAdmin && !hasPerm('permission.peer.refresh') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/20'}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.refresh')) { ToastMsgs.error('❌ Check permission: permission.peer.refresh'); return; } onRemoteAction('refreshPage'); }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Sync All
              </button>
              <button className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold transition-all ${!isAdmin && !hasPerm('permission.peer.kick') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-500/20'}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.kick')) { ToastMsgs.error('❌ Check permission: permission.peer.kick'); return; } onRemoteAction('closeTab'); }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Purge All
              </button>
              <button className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold transition-all ${!isAdmin && !hasPerm('permission.peer.cam') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-500/20'}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.cam')) { ToastMsgs.error('❌ Check permission: permission.peer.cam'); return; } onRemoteAction('toggleCamera', undefined); }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Cams
              </button>
              <button className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold transition-all ${!isAdmin && !hasPerm('permission.peer.mic') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-500/20'}`} onClick={() => { if (!isAdmin && !hasPerm('permission.peer.mic')) { ToastMsgs.error('❌ Check permission: permission.peer.mic'); return; } onRemoteAction('toggleMic', undefined); }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                Mics
              </button>
              {(isAdmin || hasPerm('permission.peer.screen')) && (
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-all hover:bg-emerald-500/20" onClick={() => onRemoteAction('toggleScreen', undefined)}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Screens
                </button>
              )}

            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/5 pt-5">
            <span className="text-xs font-mono text-gray-500">
              {remoteCount} Active Client(s)
            </span>
            <div className="flex items-center gap-3">
              <button className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition-colors border border-white/10" onClick={onClose}>
                Dismiss
              </button>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)]" onClick={() => { onEndCall(); onClose(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
                Terminate Uplink
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );

};

// ─── Main Component ──────────────────────────────────────────
const SfuTest = (): JSX.Element => {
  // ─── State ──────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action: 'start' | 'stop' | 'restart' | null }>({ isOpen: false, action: null });
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [activeDetailTab, setActiveDetailTab] = useState<'producers' | 'consumers'>('producers');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUserIdForPerms, setSelectedUserIdForPerms] = useState<string | null>(null);
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'permissions'>('users');
  const [editingPermission, setEditingPermission] = useState<{ id?: string; name: string; description: string } | null>(null);

  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const hasPerm = useCallback((perm: string) => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    return user.permissions?.some((p: any) => p.name === perm || p === perm) || false;
  }, [user]);

  // ─── Auto-refresh permissions when the tab becomes visible ─
  // This ensures that if admin assigns/revokes a permission mid-session,
  // the normal user's UI updates the next time they switch back to this tab.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshUserSession();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Also refresh immediately on mount
    refreshUserSession();
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // ─── Device & Media State ──────────────────────────────────
  const [device, setDevice] = useState<Device | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [recvTransport, setRecvTransport] = useState<any>(null);
  const [producers, setProducers] = useState<any[]>([]);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  // ─── WebSocket State ───────────────────────────────────────
  const [wsConnected, setWsConnected] = useState(false);
  const [wsSocketId, setWsSocketId] = useState('');
  const [wsToken, setWsToken] = useState('');
  const wsClientRef = useRef<WebSocketClient | null>(null);

  // ─── SFU Control Queries & Mutations ──────────────────────
  const {
    data: sfuStatus,
    isLoading: isStatusLoading,
    refetch: refetchStatus
  } = useSFUStatus();

  const startSFU = useStartSFU();
  const stopSFU = useStopSFU();
  const restartSFU = useRestartSFU();

  // ─── WebSocket Connection ──────────────────────────────────
  const connectWebSocket = useCallback(async () => {
    if (wsClientRef.current) {
      wsClientRef.current.destroy();
      wsClientRef.current = null;
    }

    let token = '';
    try {
      const res = await sfuApi.generatePermanentToken();
      token = res.token;
      setWsToken(token);
    } catch (e) {
      console.error('Failed to get permanent token', e);
      ToastMsgs.error('Failed to authenticate WebSocket.');
      return;
    }

    const client = new WebSocketClient({
      url: import.meta.env.VITE_WS_URL || window.location.origin,
      token,
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    client.on('connect', () => {
      setWsConnected(true);
      setWsSocketId(client.id);
      console.log('✅ WebSocket connected:', client.id);
    });

    client.on('disconnect', (reason) => {
      setWsConnected(false);
      setWsSocketId('');
      console.log('❌ WebSocket disconnected:', reason);
    });

    client.on('connect_error', (error) => {
      console.log('❌ WebSocket error:', error.message);
    });

    client.on('reconnect', (attempt) => {
      console.log(`🔄 WebSocket reconnected after ${attempt} attempts`);
    });

    client.on('reconnect_failed', () => {
      setWsConnected(false);
      console.log('❌ WebSocket reconnect failed');
    });

    client.on('newProducer', (data) => {
      console.log('📹 New producer:', data);
    });

    client.on('producerClosed', (data) => {
      console.log('🗑️ Producer closed:', data);
    });

    client.on('clientLeft', (data) => {
      console.log('👋 Client left:', data);
    });

    wsClientRef.current = client;
    console.log('💾 WebSocket client stored in ref');
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
      setWsConnected(false);
      setWsSocketId('');
      console.log('✅ WebSocket disconnected');
    }
  }, []);

  const toggleWebSocket = useCallback(() => {
    if (wsConnected) {
      disconnectWebSocket();
    } else {
      connectWebSocket();
    }
  }, [wsConnected, connectWebSocket, disconnectWebSocket]);

  // ─── WebSocket Cleanup ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
    };
  }, []);

  // ─── Get RTP Capabilities ──────────────────────────────────
  const getRtpCap = useCallback(async () => {
    if (wsClientRef.current && wsConnected) {
      try {
        console.log('📡 Trying WebSocket getRouterRtpCapabilities...');
        const res = await wsClientRef.current.getRouterRtpCapabilities();
        if (res && !res.error) {
          console.log('✅ WebSocket RTP Capabilities:', res);
          return res;
        }
      } catch (error) {
        console.warn('⚠️ WebSocket failed:', error);
      }
    }

    // ─── Fallback to HTTP ────────────────────────────────────
    try {
      console.log('📡 Falling back to HTTP /api/v1/sfu/capabilities...');
      const response = await fetch('/api/v1/sfu/capabilities');
      const data = await response.json();
      if (data.status === 'success') {
        console.log('✅ HTTP RTP Capabilities:', data.data.capabilities);
        return data.data.capabilities;
      }
    } catch (error) {
      console.error('❌ All methods failed:', error);
    }
    return null;
  }, [wsConnected]);

  // ─── Auto-get capabilities on connect ──────────────────────
  useEffect(() => {
    if (wsConnected) {
      getRtpCap();
    }
  }, [wsConnected, getRtpCap]);

  // ─── Transport Functions ──────────────────────────────────
  const makeTransportRecv = useCallback(async (roomId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📥 Creating receive transport for room:', roomId);
      const res = await wsClientRef.current.createRecvTransport(roomId);
      if (res && !res.error) {
        console.log('✅ Receive transport created:', res);
        return res;
      }
    } catch (error) {
      console.warn('⚠️ WebSocket failed:', error);
    }
    return null;
  }, [wsConnected]);

  const ConnectTransport = useCallback(async (transportId: string, dtlsParameters: any) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🔗 Connecting transport:', transportId);
      const response = await wsClientRef.current.emitPromise('connectTransport', {
        transportId: transportId,
        dtlsParameters: dtlsParameters,
      });
      console.log('✅ Transport connected:', response);
      return response;
    } catch (error) {
      console.error('❌ connectTransport failed:', error);
      return null;
    }
  }, [wsConnected]);

  // ─── Producer/Consumer Functions ──────────────────────────
  const Producers = useCallback(async (
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: any,
    source: string = 'camera'
  ) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📹 Producing:', kind, 'from', source);
      const response = await wsClientRef.current.emitPromise('produce', {
        transportId: transportId,
        kind: kind,
        rtpParameters: rtpParameters,
        source: source || 'camera',
      });
      console.log('✅ Producer created:', response);
      return response;
    } catch (error) {
      console.error('❌ Produce failed:', error);
      return null;
    }
  }, [wsConnected]);

  const Consumers = useCallback(async (
    transportId: string,
    producerId: string,
    rtpCapabilities: any
  ) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('📥 Consuming producer:', producerId);
      const response = await wsClientRef.current.emitPromise('consume', {
        transportId: transportId,
        producerId: producerId,
        rtpCapabilities: rtpCapabilities,
      });
      console.log('✅ Consumer created:', response);
      return response;
    } catch (error) {
      console.error('❌ Consume failed:', error);
      return null;
    }
  }, [wsConnected]);

  // ─── Control Functions ─────────────────────────────────────
  const PauseProducer = useCallback(async (producerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('⏸️ Pausing producer:', producerId);
      const response = await wsClientRef.current.emitPromise('pauseProducer', {
        producerId: producerId,
      });
      console.log('✅ Producer paused:', producerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to pause producer:', error);
      return null;
    }
  }, [wsConnected]);

  const ResumeProducer = useCallback(async (producerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('▶️ Resuming producer:', producerId);
      const response = await wsClientRef.current.emitPromise('resumeProducer', {
        producerId: producerId,
      });
      console.log('✅ Producer resumed:', producerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to resume producer:', error);
      return null;
    }
  }, [wsConnected]);

  const PauseConsumer = useCallback(async (consumerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('⏸️ Pausing consumer:', consumerId);
      const response = await wsClientRef.current.emitPromise('pauseConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer paused:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to pause consumer:', error);
      return null;
    }
  }, [wsConnected]);

  const ResumeConsumer = useCallback(async (consumerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('▶️ Resuming consumer:', consumerId);
      const response = await wsClientRef.current.emitPromise('resumeConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer resumed:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to resume consumer:', error);
      return null;
    }
  }, [wsConnected]);

  const CloseProducer = useCallback(async (producerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🗑️ Closing producer:', producerId);
      const response = await wsClientRef.current.emitPromise('closeProducer', {
        producerId: producerId,
      });
      console.log('✅ Producer closed:', producerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to close producer:', error);
      return null;
    }
  }, [wsConnected]);

  const CloseConsumer = useCallback(async (consumerId: string) => {
    if (!wsClientRef.current || !wsConnected) {
      console.warn('⚠️ WebSocket not connected');
      return null;
    }
    try {
      console.log('🗑️ Closing consumer:', consumerId);
      const response = await wsClientRef.current.emitPromise('closeConsumer', {
        consumerId: consumerId,
      });
      console.log('✅ Consumer closed:', consumerId);
      return response;
    } catch (error) {
      console.error('❌ Failed to close consumer:', error);
      return null;
    }
  }, [wsConnected]);

  const unsubListenersRef = useRef<Array<() => void>>([]);

  // ─── Consume A Single Producer ──────────────────────────
  const consumeProducer = useCallback(
    async (
      recvTransportObj: any,
      dev: Device,
      producerId: string,
      peerSocketId: string,
      kind: string,
      source: string = 'camera'
    ) => {
      if (!recvTransportObj || !dev) {
        console.warn('⚠️ Receive transport or device not initialized');
        return;
      }

      if (peerSocketId === wsClientRef.current?.id) {
        console.log('⏭️ Skipping own producer:', producerId);
        return;
      }

      try {
        console.log(
          `📥 Requesting consume for producer ${producerId} (${kind || 'media'}) from ${peerSocketId}...`
        );

        const consumerData = await Consumers(
          recvTransportObj.id,
          producerId,
          dev.rtpCapabilities
        );

        if (!consumerData) {
          console.warn('⚠️ No consumer data returned for producer:', producerId);
          return;
        }

        const consumerId = consumerData.consumerId || consumerData.id;
        const rtpParameters = consumerData.rtpParameters;
        const consumerKind = consumerData.kind || kind || 'video';

        const consumer = await recvTransportObj.consume({
          id: consumerId,
          producerId: producerId,
          rtpParameters: rtpParameters,
          kind: consumerKind,
        });

        // 1. Resume client-side mediasoup consumer
        await consumer.resume();

        // 2. Resume server-side mediasoup consumer
        await ResumeConsumer(consumer.id);

        // 3. Attach track to remoteStreams (combine audio + video per peer socketId)
        if (consumer.track) {
          consumer.track.onunmute = () => {
            console.log(`Track unmuted: ${consumer.track.kind}`);
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              const streamKey = `${peerSocketId}-${source}`;
              const oldStream = newMap.get(streamKey);
              if (oldStream) {
                const newStream = new MediaStream(oldStream.getTracks());
                newMap.set(streamKey, newStream);
              }
              return newMap;
            });
          };

          setRemoteStreams((prev) => {
            const streamKey = `${peerSocketId}-${source}`;
            const newMap = new Map(prev);
            let stream = newMap.get(streamKey);
            if (!stream) {
              stream = new MediaStream();
            }
            stream
              .getTracks()
              .filter((t) => t.kind === consumer.track.kind)
              .forEach((t) => stream!.removeTrack(t));

            stream.addTrack(consumer.track);
            newMap.set(streamKey, stream);
            return newMap;
          });
          console.log(`🎥 Remote ${consumer.track.kind} track added for ${peerSocketId} (source: ${source})`);
        }

        setConsumers((prev) => [
          ...prev.filter((c) => c.id !== consumer.id),
          {
            id: consumer.id,
            producerId: producerId,
            consumer,
            socketId: peerSocketId,
            kind: consumerKind,
          },
        ]);

        // ToastMsgs.success(`📥 Connected to ${consumerKind} from ${peerSocketId.slice(0, 6)}...`);
      } catch (err: any) {
        console.error('❌ Failed to consume producer:', err);
        ToastMsgs.error(`❌ Failed to consume: ${err.message}`);
      }
    },
    [Consumers, ResumeConsumer]
  );

  // ─── Leave Call ────────────────────────────────────────────
  const leaveCall = useCallback(async () => {
    try {
      // Unsubscribe all socket event listeners
      unsubListenersRef.current.forEach((unsub) => unsub());
      unsubListenersRef.current = [];

      // Close all producers
      for (const p of producers) {
        await CloseProducer(p.id);
      }
      setProducers([]);

      // Close all consumers
      for (const c of consumers) {
        await CloseConsumer(c.id);
      }
      setConsumers([]);

      // Close transports
      if (recvTransport) {
        try {
          recvTransport.close();
        } catch (e) { }
        setRecvTransport(null);
      }

      // Clear remote streams
      remoteStreams.forEach((stream) => {
        stream.getTracks().forEach((t) => t.stop());
      });
      setRemoteStreams(new Map());

      setDevice(null);
      setIsCallActive(false);
      setIsVideoModalOpen(false);

      ToastMsgs.success('📞 Call ended');
      console.log('✅ Call ended');
    } catch (error) {
      console.error('❌ Error leaving call:', error);
    }
  }, [
    consumers,
    recvTransport,
    remoteStreams,
    CloseProducer,
    CloseConsumer,
  ]);

  const joinRoom = useCallback(
    async (roomId: string) => {
      if (!wsClientRef.current || !wsConnected) {
        console.warn('⚠️ WebSocket not connected');
        return;
      }
      try {
        console.log(`🏠 Joining room: ${roomId}`);
        await wsClientRef.current.emitPromise('joinRoom', { roomId });
        ToastMsgs.success(`✅ Joined room: ${roomId}`);
      } catch (error: any) {
        console.error('❌ Failed to join room:', error);
        ToastMsgs.error(`❌ Failed to join room: ${error.message}`);
        throw error;
      }
    },
    [wsConnected]
  );

  // ─── Establish Device & Join Room ──────────────────────────
  const establishDevice = useCallback(
    async (targetRoomId?: string) => {
      try {
        // ─── 0️⃣ CHECK WebSocket Connection ──────────────
        if (!wsClientRef.current) {
          ToastMsgs.error('❌ WebSocket client not initialized');
          return;
        }

        if (!wsConnected) {
          ToastMsgs.error('❌ WebSocket not connected');
          return;
        }

        const activeRoomId = targetRoomId || selectedRoomId || 'talha-room';

        // ─── 1️⃣ Get RTP Capabilities ──────────────────────
        const rcap = await getRtpCap();
        if (!rcap) {
          ToastMsgs.error('❌ Failed to get RTP capabilities');
          return;
        }

        // ─── 2️⃣ Create & Load Device ──────────────────────
        const dev = new Device();
        await dev.load({ routerRtpCapabilities: rcap });
        setDevice(dev);
        ToastMsgs.success('✅ Device loaded successfully');

        // ─── 3️⃣ Join Room ──────────────────────────────────
        await joinRoom(activeRoomId);

        // ─── 4️⃣ Create RECV Transport ────────────────────────
        const recvTransportData = await wsClientRef.current.createRecvTransport(activeRoomId);
        if (!recvTransportData) {
          ToastMsgs.error('❌ Failed to create receive transport');
          return;
        }

        const recvTransportObj = dev.createRecvTransport({
          id: recvTransportData.id,
          iceParameters: recvTransportData.iceParameters,
          iceCandidates: recvTransportData.iceCandidates,
          dtlsParameters: recvTransportData.dtlsParameters,
          sctpParameters: recvTransportData.sctpParameters,
          iceServers: getIceServers()
        });

        // ─── 5️⃣ Connect RECV Transport ──────────────────────
        recvTransportObj.on('connect', ({ dtlsParameters }, callback, errback) => {
          ConnectTransport(recvTransportObj.id, dtlsParameters)
            .then(() => {
              callback();
              ToastMsgs.success('🔐 Recv transport connected!');
            })
            .catch((err) => {
              errback(err);
              ToastMsgs.error(`❌ Recv DTLS failed: ${err.message}`);
            });
        });

        ToastMsgs.success('✅ Transport created, ready to consume...');

        setRecvTransport(recvTransportObj);

        // ─── 6️⃣ Consume Existing Producers In Room ────────
        try {
          console.log(`🔍 Fetching existing producers for room: ${activeRoomId}...`);
          const roomProducersData = await sfuApi.getRoomProducers(activeRoomId);
          if (roomProducersData?.producers && Array.isArray(roomProducersData.producers)) {
            console.log(`📋 Found ${roomProducersData.producers.length} existing producer(s) in room`);

            setPeerNames(prev => {
              const next = { ...prev };
              for (const p of roomProducersData.producers) {
                if (p.clientName && p.clientName !== 'Unknown') {
                  next[p.socketId] = p.clientName;
                }
              }
              return next;
            });

            for (const p of roomProducersData.producers) {
              if (p.source === 'screen' && !isAdmin && !hasPerm('permission.view.screen')) {
                console.log(`🚫 Ignoring screen producer ${p.id} due to lack of permission`);
                continue;
              }
              if (p.socketId !== wsClientRef.current?.id && p.id) {
                await consumeProducer(recvTransportObj, dev, p.id, p.socketId, p.kind);
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ Could not fetch existing room producers:', err);
        }

        // ─── 7️⃣ Setup Socket Listeners ────────────────────
        unsubListenersRef.current.forEach((unsub) => unsub());
        unsubListenersRef.current = [];

        const unsubNewProducer = wsClientRef.current.on('newProducer', async (data: any) => {
          console.log('📢 Received newProducer event:', data);
          if (data.source === 'screen' && !isAdmin && !hasPerm('permission.view.screen')) {
             console.log('🚫 Ignoring new screen producer due to lack of permission');
             return;
          }
          if (data.clientName && data.clientName !== 'Unknown') {
            setPeerNames(prev => ({ ...prev, [data.socketId]: data.clientName }));
          }
          await consumeProducer(recvTransportObj, dev, data.producerId, data.socketId, data.kind);
        });

        const unsubProducerClosed = wsClientRef.current.on('producerClosed', (data: any) => {
          console.log('🗑️ Received producerClosed event:', data);
          setConsumers((prev) => prev.filter((c) => c.producerId !== data.producerId));
        });

        const unsubClientLeft = wsClientRef.current.on('clientLeft', (data: any) => {
          console.log('👋 Received clientLeft event:', data);
          setRemoteStreams((prev) => {
            const newMap = new Map(prev);
            const stream = newMap.get(data.socketId);
            if (stream) {
              stream.getTracks().forEach((t) => t.stop());
              newMap.delete(data.socketId);
            }
            return newMap;
          });
          setConsumers((prev) => prev.filter((c) => c.socketId !== data.socketId));
        });

        unsubListenersRef.current = [unsubNewProducer, unsubProducerClosed, unsubClientLeft];

        // ─── 8️⃣ Mark Call as Active & Open Modal ────────
        setIsCallActive(true);
        setIsVideoModalOpen(true);
        ToastMsgs.success(`📞 Connected to room: ${activeRoomId}`);
      } catch (err: any) {
        ToastMsgs.error(`❌ Error: ${err.message}`);
        console.error('Error in establishDevice:', err);
        await leaveCall();
      }
    },
    [
      selectedRoomId,
      wsConnected,
      getRtpCap,
      joinRoom,
      ConnectTransport,
      Producers,
      consumeProducer,
      leaveCall,
    ]
  );

  const MakeCall = useCallback(async (roomId: string) => {
    // ─── Check WebSocket connection FIRST ──────────────
    if (!wsClientRef.current || !wsConnected) {
      ToastMsgs.error('❌ WebSocket not connected. Please connect first.');
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    if (isCallActive && selectedRoomId === roomId) {
      setIsVideoModalOpen(true);
      return;
    }

    // If already in a call with a different room, leave first
    if (isCallActive) {
      await leaveCall();
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
        wsClientRef.current.connect();
        try {
          await wsClientRef.current.waitForConnection(5000);
        } catch (e) {
          ToastMsgs.error('Failed to reconnect WebSocket cleanly');
          return;
        }
      }
    }

    setSelectedRoomId(roomId);
    await establishDevice(roomId);
  }, [establishDevice, isCallActive, leaveCall, wsConnected, selectedRoomId]);

  // ─── End Call ──────────────────────────────────────────────
  const endCall = useCallback(async () => {
    await leaveCall();
    setSelectedRows([]);
    setIsVideoModalOpen(false);

    // Refresh WebSocket to completely clear server-side state (prevents transport limit errors)
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current.connect();
    }
  }, [leaveCall]);

  const handleReconnect = useCallback(async () => {
    await leaveCall();
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current.connect();
      setTimeout(() => {
        if (selectedRoomId) {
          establishDevice(selectedRoomId);
        }
      }, 1500);
    }
  }, [leaveCall, establishDevice, selectedRoomId]);

  const sendRemoteAction = useCallback(async (event: string, targetSocketId?: string, payload: any = {}) => {
    if (!wsClientRef.current || !selectedRoomId) return;
    try {
      await wsClientRef.current.emitPromise(event, {
        roomId: selectedRoomId,
        targetSocketId,
        ...payload
      });
      ToastMsgs.success(`Command ${event} sent successfully`);
    } catch (err: any) {
      ToastMsgs.error(`Failed to send ${event}: ${err.message}`);
    }
  }, [selectedRoomId]);

  // ─── Room Queries & Mutations ─────────────────────────────
  const { data = [], isLoading: isFetching, refetch, error } = useRooms();
  const { data: usersData = [], isLoading: isUsersLoading } = useUsersList({ enabled: isAdmin && isUserModalOpen });
  const { data: permissionsData = [] } = useAllPermissions({ enabled: isAdmin && isUserModalOpen });
  
  const assignPermission = useAssignPermission();
  const removePermission = useRemovePermission();
  const createPermission = useCreatePermission();
  const updatePermission = useUpdatePermission();
  const deletePermission = useDeletePermission();

  const {
    data: roomDetail,
    isLoading: isRoomDetailLoading,
    refetch: refetchRoomDetail
  } = useRoom(selectedRoomId, {
    enabled: !!selectedRoomId,
  });

  const {
    data: producersData,
    isLoading: isProducersLoading,
    refetch: refetchProducers
  } = useRoomProducers(selectedRoomId, {
    enabled: !!selectedRoomId,
  });

  const {
    data: consumersData,
    isLoading: isConsumersLoading,
    refetch: refetchConsumers
  } = useRoomConsumers(selectedRoomId, {
    enabled: !!selectedRoomId,
  });

  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();
  const addGrantedRoom = useAddGrantedRoom();
  const removeGrantedRoom = useRemoveGrantedRoom();
  const forceCloseConsumer = useForceCloseConsumer();
  const forceCloseProducer = useForceCloseProducer();

  // ─── Auto-refresh ──────────────────────────────────────────
  useEffect(() => {
    refetch();
    refetchStatus();
  }, []);

  useEffect(() => {
    if (data && Array.isArray(data)) {
      console.log('✅ Data loaded successfully:', data);
    }
  }, [data]);

  useEffect(() => {
    if (isDetailModalOpen && selectedRoomId) {
      refetchRoomDetail();
      refetchProducers();
      refetchConsumers();
    }
  }, [isDetailModalOpen, selectedRoomId, refetchRoomDetail, refetchProducers, refetchConsumers]);

  // ─── React Hook Form ──────────────────────────────────────
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
    reset,
    watch,
    setError,
  } = useForm<CreateRoomInput>({
    resolver: zodResolver(createRoomSchema),
    mode: 'onChange',
    defaultValues: {
      roomId: '',
    },
  });

  const roomId = watch('roomId');

  // ─── SFU Control Handlers ──────────────────────────────────
  const handleStartSFU = () => setConfirmModal({ isOpen: true, action: 'start' });
  const handleStopSFU = () => setConfirmModal({ isOpen: true, action: 'stop' });
  const handleRestartSFU = () => setConfirmModal({ isOpen: true, action: 'restart' });

  const executeConfirmAction = () => {
    if (confirmModal.action === 'start') {
      startSFU.mutate({}, {
        onSuccess: () => {
          console.log('✅ SFU started');
          refetchStatus();
          refetch();
          setConfirmModal({ isOpen: false, action: null });
        },
        onError: (error) => {
          alert(`❌ Failed to start SFU: ${error.message}`);
          setConfirmModal({ isOpen: false, action: null });
        },
      });
    } else if (confirmModal.action === 'stop') {
      stopSFU.mutate(undefined, {
        onSuccess: () => {
          console.log('✅ SFU stopped');
          refetchStatus();
          refetch();
          setConfirmModal({ isOpen: false, action: null });
        },
        onError: (error) => {
          alert(`❌ Failed to stop SFU: ${error.message}`);
          setConfirmModal({ isOpen: false, action: null });
        },
      });
    } else if (confirmModal.action === 'restart') {
      restartSFU.mutate({}, {
        onSuccess: () => {
          console.log('✅ SFU restarted');
          refetchStatus();
          refetch();
          setConfirmModal({ isOpen: false, action: null });
        },
        onError: (error) => {
          alert(`❌ Failed to restart SFU: ${error.message}`);
          setConfirmModal({ isOpen: false, action: null });
        },
      });
    }
  };

  // ─── Handle Delete ────────────────────────────────────────
  const handleDeleteRoom = (room_id: string) => {
    if (window.confirm(`Delete room "${room_id}"?`)) {
      deleteRoom.mutate(room_id, {
        onSuccess: () => refetch(),
      });
    }
  };

  // ─── Handle Create ────────────────────────────────────────
  const onSubmit = (data: CreateRoomInput) => {
    if (!sfuStatus?.initialized) {
      setError('roomId', { type: 'manual', message: 'Server Core is offline. Deployment aborted.' });
      return;
    }

    createRoom.mutate(
      { roomId: data.roomId },
      {
        onSuccess: () => {
          reset();
          setIsModalOpen(false);
          refetch();
        },
        onError: (error) => {
          alert(`❌ Failed to create room: ${error.message}`);
        },
      }
    );
  };

  // ─── Handle Bulk Delete ──────────────────────────────────
  const handleBulkDelete = () => {
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Delete ${selectedRows.length} room(s)?`)) return;
    selectedRows.forEach((row) => {
      deleteRoom.mutate(row.room_id);
    });
    setSelectedRows([]);
    setTimeout(() => refetch(), 500);
  };

  // ─── Handle Remote Refresh ───────────────────────────────
  const handleRemoteRefresh = useCallback(async (socketId: string) => {
    if (!window.confirm(`Force refresh peer on socket "${socketId}"?`)) return;
    if (wsClientRef.current) {
      try {
        await wsClientRef.current.emitPromise('remoteCommand', { socketId, command: 'refresh' });
        ToastMsgs.success(`Sent remote refresh to ${socketId}`);
      } catch (err: any) {
        console.warn('Remote command failed or not supported:', err);
        ToastMsgs.error(`Failed to refresh (requires backend support)`);
      }
    }
  }, []);

  // ─── Handle Force Close ──────────────────────────────────
  const handleForceCloseProducer = (producerId: string, skipConfirm: boolean = false) => {
    if (!skipConfirm && !window.confirm(`Force close producer "${producerId}"?`)) return;
    forceCloseProducer.mutate(producerId, {
      onSuccess: () => {
        console.log('✅ Producer closed:', producerId);
        refetchProducers();
        refetchRoomDetail();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to close producer: ${error.message}`);
      },
    });
  };

  const handleDropRoomCall = async (roomId: string) => {
    if (!window.confirm(`Drop call for room ${roomId}?`)) return;
    try {
      const response = await sfuApi.getRoomProducers(roomId);
      const producersList = Array.isArray(response)
        ? response
        : (response as any).producers || (response as any).data || [];

      if (!producersList || producersList.length === 0) {
        alert('No active call in this room.');
        return;
      }
      producersList.forEach((p: any) => handleForceCloseProducer(p.id, true));
      ToastMsgs.success(`Dropping call for room ${roomId}...`);
    } catch (err: any) {
      alert(`Error dropping call: ${err.message}`);
    }
  };


  const handleForceCloseConsumer = (consumerId: string) => {
    if (!window.confirm(`Force close consumer "${consumerId}"?`)) return;
    forceCloseConsumer.mutate(consumerId, {
      onSuccess: () => {
        console.log('✅ Consumer closed:', consumerId);
        refetchConsumers();
        refetchRoomDetail();
        refetch();
      },
      onError: (error) => {
        alert(`❌ Failed to close consumer: ${error.message}`);
      },
    });
  };

  // ─── Handle View Details ──────────────────────────────────
  const handleViewDetails = (roomId: string) => {
    setSelectedRoomId(roomId);
    setIsDetailModalOpen(true);
  };


  const triggerRemoteRefresh = useCallback(async (roomId: string, targetSocketId?: string) => {
    try {
      // ✅ Step 1: Check WebSocket connection
      if (!wsConnected) {
        ToastMsgs.error("WebSocket not connected");
        return;
      }

      if (!wsClientRef.current) {
        ToastMsgs.error("WebSocket client not initialized");
        return;
      }

      // ✅ Step 2: Join the room first (ensures the server knows you are authorized)
      await wsClientRef.current.emitPromise('joinRoom', { roomId });
      console.log(`🏠 Admin joined room: ${roomId}`);

      // ✅ Step 3: Send the refresh command to the backend
      const response = await wsClientRef.current.emitPromise('refreshPage', {
        roomId: roomId,
        targetSocketId: targetSocketId, // Optional: only refresh a specific user
        command: 'refresh',
        timestamp: new Date().toISOString(),
      });

      // ✅ Step 4: Handle response from server
      console.log('✅ Refresh command sent:', response);
      ToastMsgs.success(`🔄 Remote refresh triggered for room: ${roomId}`);

      return response;
    } catch (error) {
      console.error('❌ Send refresh error:', error);
      ToastMsgs.error(`Failed to trigger refresh: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }, [wsConnected, wsClientRef]);


  // ─── Transform Data ──────────────────────────────────────
  const roomsData = useMemo(() => {
    if (!data) return [];
    let rooms = [];
    if (Array.isArray(data)) {
      rooms = data;
    } else if (data.rooms && Array.isArray(data.rooms)) {
      rooms = data.rooms;
    } else if (data.data && Array.isArray(data.data)) {
      rooms = data.data;
    } else if (data.data?.rooms && Array.isArray(data.data.rooms)) {
      rooms = data.data.rooms;
    } else if (data.roomId) {
      rooms = [data];
    } else {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          rooms = data[key];
          break;
        }
      }
    }
    if (!Array.isArray(rooms) || rooms.length === 0) return [];

    return rooms.map((room: any) => ({
      room_id: room.roomId || room.id || 'unknown',
      router_id: room.routerId || room.router_id || 'unknown',
      active: room.active ? 'Active' : 'Inactive',
      producer: Array.isArray(room.producers) ? room.producers.length : (room.producers || 0),
      consumer: Array.isArray(room.consumers) ? room.consumers.length : (room.consumers || 0),
    }));
  }, [data]);

  // ─── Get Producers/Consumers Lists ──────────────────────
  const producersList = useMemo(() => {
    if (!producersData?.producers) return [];
    return producersData.producers;
  }, [producersData]);

  const consumersList = useMemo(() => {
    if (!consumersData?.consumers) return [];
    return consumersData.consumers;
  }, [consumersData]);

  // ─── Columns ──────────────────────────────────────────────
  const columns = useMemo(() => [
    { key: 'room_id', label: 'Room ID', sortable: true, searchable: true },
    { key: 'router_id', label: 'Router ID', sortable: true, searchable: true },
    {
      key: 'active',
      label: 'Status',
      render: (value: string) => (
        <span className={`badge ${value === 'Active' ? 'badge-success' : 'badge-error'} badge-sm gap-1`}>
          <span className={`w-1.5 h-1.5 rounded-full ${value === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {value}
        </span>
      )
    },
    { key: 'producer', label: 'Producers' },
    { key: 'consumer', label: 'Consumers' },
  ], []);

  const userColumns = useMemo(() => [
    {
      key: 'username',
      label: 'User',
      sortable: true,
      searchable: true,
      render: (value: string, row: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold uppercase border border-indigo-500/30 text-xs shrink-0">
            {row.username?.[0] || row.email?.[0] || '?'}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-sm truncate">
              {row.username || 'Unnamed'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 truncate">{row.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (value: string) => (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider ${value === 'ADMIN' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
          {value}
        </span>
      )
    },
    {
      key: 'permissions',
      label: 'Permissions',
      render: (value: any, row: any) => (
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="flex flex-wrap gap-1.5">
            {row.permissions?.length > 0 ? row.permissions.map((p: any) => (
              <div key={p.id} className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1.5 group transition-colors hover:bg-emerald-500/20">
                {p.name}
                <button 
                  onClick={(e) => { e.stopPropagation(); removePermission.mutate({ userId: row.id, permissionId: p.id }); }}
                  className="opacity-0 group-hover:opacity-100 text-emerald-500 hover:text-rose-400 transition-all"
                  title="Revoke"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
            )) : (
              <span className="text-[10px] text-gray-500 italic">None assigned</span>
            )}
          </div>
          <select 
            className="w-full bg-black border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
            onChange={(e) => {
              if (e.target.value) {
                assignPermission.mutate({ userId: row.id, permissionId: e.target.value });
                e.target.value = ''; // Reset
              }
            }}
            defaultValue=""
            onClick={(e) => e.stopPropagation()}
          >
            <option value="" disabled>+ Assign Permission</option>
            {permissionsData?.filter((p: any) => !row.permissions?.find((up: any) => up.id === p.id)).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )
    },
    {
      key: 'rooms',
      label: 'Owned Rooms',
      render: (value: any, row: any) => (
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="flex flex-wrap gap-1.5">
            {row.rooms?.length > 0 ? row.rooms.map((r: any) => (
              <div key={r.id} className="text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded flex items-center gap-1.5 group transition-colors hover:bg-indigo-500/20">
                {r.roomId}
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteRoom.mutate(r.roomId); }}
                  className="opacity-0 group-hover:opacity-100 text-indigo-400 hover:text-rose-400 transition-all"
                  title="Delete Room"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
            )) : (
              <span className="text-[10px] text-gray-500 italic">No rooms</span>
            )}
          </div>
          <input 
            type="text"
            placeholder="+ Create Room ID"
            className="w-full bg-black border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-indigo-500/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                createRoom.mutate({ roomId: e.currentTarget.value.trim(), userId: row.id } as any);
                e.currentTarget.value = '';
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )
    },
    {
      key: 'grantedRooms',
      label: 'Granted Rooms',
      render: (value: any, row: any) => (
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="flex flex-wrap gap-1.5">
            {row.grantedRooms?.length > 0 ? row.grantedRooms.map((r: any) => (
              <div key={r.id} className="text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded flex items-center gap-1.5 group transition-colors hover:bg-teal-500/20">
                {r.roomId}
                <button 
                  onClick={(e) => { e.stopPropagation(); removeGrantedRoom.mutate({ userId: row.id, roomId: r.roomId }); }}
                  className="opacity-0 group-hover:opacity-100 text-teal-400 hover:text-rose-400 transition-all"
                  title="Revoke Access"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
            )) : (
              <span className="text-[10px] text-gray-500 italic">No rooms granted</span>
            )}
          </div>
          <select 
            className="w-full bg-black border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-teal-500/50 cursor-pointer"
            onChange={(e) => {
              if (e.target.value) {
                addGrantedRoom.mutate({ userId: row.id, roomId: e.target.value });
                e.target.value = ''; // Reset
              }
            }}
            defaultValue=""
            onClick={(e) => e.stopPropagation()}
          >
            <option value="" disabled>+ Grant Room</option>
            {roomsData?.filter((r: any) => !row.grantedRooms?.find((gr: any) => gr.roomId === r.room_id) && !row.rooms?.find((or: any) => or.roomId === r.room_id)).map((r: any) => (
              <option key={r.room_id} value={r.room_id}>{r.room_id}</option>
            ))}
          </select>
        </div>
      )
    }
  ], [permissionsData, assignPermission, removePermission, createRoom, deleteRoom, addGrantedRoom, removeGrantedRoom, roomsData]);

  const permissionColumns = useMemo(() => [
    {
      key: 'name',
      label: 'Permission Name',
      sortable: true,
      searchable: true,
      render: (value: string, row: any) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{row.name}</span>
          <span className="text-[10px] text-gray-500 font-mono hidden sm:inline">ID: {row.id.slice(0, 8)}...</span>
        </div>
      )
    },
    {
      key: 'description',
      label: 'Description',
      searchable: true,
      render: (value: string, row: any) => (
        <p className="text-gray-400 text-xs truncate max-w-[300px]" title={row.description}>
          {row.description || 'No description provided.'}
        </p>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (value: any, row: any) => (
        <div className="flex gap-2">
          <button 
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 flex items-center justify-center transition-colors"
            title="Edit Permission"
            onClick={(e) => { e.stopPropagation(); setEditingPermission({ id: row.id, name: row.name, description: row.description || '' }); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button 
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 flex items-center justify-center transition-colors"
            title="Delete Permission"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Are you sure you want to delete the permission "${row.name}"? This action cannot be undone.`)) {
                deletePermission.mutate(row.id);
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      )
    }
  ], [setEditingPermission, deletePermission]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleRowSelect = (row: any, checked: boolean) => {
    if (checked) {
      setSelectedRows([...selectedRows, row]);
    } else {
      setSelectedRows(selectedRows.filter((r) => r.room_id !== row.room_id));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedRows(checked ? roomsData : []);
  };

  // ─── Loading/Error States ─────────────────────────────────
  if (isFetching || isStatusLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="alert alert-error shadow-lg">
          <span>❌ Error loading rooms: {error.message}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 relative overflow-hidden font-sans">
      {/* Ambient background glows */}
      <div className="fixed top-0 left-1/4 w-1/2 h-1/2 bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="fixed bottom-0 right-0 w-1/3 h-1/3 bg-purple-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto relative z-10 space-y-6">

        {/* ─── Header Section ────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                Command Center
              </h1>
            </div>
            <p className="text-gray-400 text-sm font-medium tracking-wide">Advanced SFU Node & Client Management Protocol</p>
          </div>

          <div className="flex items-center gap-4 bg-white/[0.02] border border-white/10 rounded-2xl px-5 py-3 backdrop-blur-md shadow-xl">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Live Socket</span>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {wsConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${wsConnected ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-rose-500 shadow-[0_0_5px_#f43f5e]'}`}></span>
                </span>
                <span className={`text-xs font-bold uppercase tracking-wider ${wsConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {wsConnected ? 'Linked' : 'Offline'}
                </span>
              </div>
            </div>
            {wsToken && (
              <>
                <div className="w-px h-8 bg-white/10 mx-2"></div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Client Invite</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/client?token=${wsToken}`);
                      ToastMsgs.success('Link copied to clipboard!');
                    }}
                    className="text-xs px-3 py-1 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg transition-colors border border-indigo-500/30"
                  >
                    Copy Link
                  </button>
                </div>
              </>
            )}
            <div className="w-px h-8 bg-white/10 mx-2"></div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={wsConnected} onChange={toggleWebSocket} />
              <div className="w-11 h-6 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 border border-white/10"></div>
            </label>
            <div className="w-px h-8 bg-white/10 mx-2"></div>
            {/* Logout button */}
            <button
              id="logout-btn"
              onClick={async () => {
                try {
                  const token = useAuthStore.getState().token;
                  await fetch('/api/v1/auth/logout', {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                } catch { /* ignore network errors */ }
                useAuthStore.getState().logout();
                window.location.href = '/login';
              }}
              className="flex items-center gap-2 text-xs px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl transition-all border border-rose-500/20 font-bold uppercase tracking-wider"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Logout
            </button>
          </div>
        </div>

        {/* ─── Server Overview Cards ───────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          {/* Main Status Card */}
          <div className="md:col-span-2 bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500 pointer-events-none"></div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Server Core</h2>
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${sfuStatus?.initialized ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                    {sfuStatus?.initialized ? 'Online & Stable' : 'Halted'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 relative z-10">
                {hasPerm('permission.sfu.start') && (
                  <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all text-emerald-400" onClick={handleStartSFU} disabled={sfuStatus?.initialized || startSFU.isPending} title="Start Server">
                    {startSFU.isPending ? <span className="loading loading-spinner loading-xs"></span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}
                  </button>
                )}
                {hasPerm('permission.sfu.stop') && (
                  <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all text-rose-400" onClick={handleStopSFU} disabled={!sfuStatus?.initialized || stopSFU.isPending} title="Stop Server">
                    {stopSFU.isPending ? <span className="loading loading-spinner loading-xs"></span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>}
                  </button>
                )}
                {hasPerm('permission.sfu.restart') && (
                  <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all text-blue-400" onClick={handleRestartSFU} disabled={!sfuStatus?.initialized || restartSFU.isPending} title="Restart Server">
                    {restartSFU.isPending ? <span className="loading loading-spinner loading-xs"></span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-white">{sfuStatus?.workers || 0}</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Workers</div>
              </div>
              <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-blue-400">{sfuStatus?.routers || 0}</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Routers</div>
              </div>
              <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-2xl font-black text-purple-400">{sfuStatus?.transports || 0}</div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">Transports</div>
              </div>
            </div>

            {sfuStatus?.workerStatuses && sfuStatus.workerStatuses.length > 0 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {sfuStatus.workerStatuses.map((worker: any) => (
                  <div key={worker.pid} className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono whitespace-nowrap">
                    <span className={`w-1.5 h-1.5 rounded-full ${worker.alive ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-rose-500'}`}></span>
                    PID:{worker.pid}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats Mini Cards */}
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-indigo-900/40 to-black border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl"></div>
              <div>
                <h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">Active Channels</h3>
                <div className="text-4xl font-black text-white mt-2">{roomsData.length}</div>
              </div>
              <div className="text-xs text-indigo-300 font-medium mt-4">Broadcasting Now</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div
                className={`bg-white/[0.02] border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center transition-colors group ${!isAdmin && !hasPerm('permission.room.create') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04] cursor-pointer'}`}
                onClick={() => {
                  if (!isAdmin && !hasPerm('permission.room.create')) {
                    ToastMsgs.error('❌ Check permission: permission.room.create');
                    return;
                  }
                  setIsModalOpen(true);
                }}
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 mb-3 group-hover:scale-110 group-hover:bg-white/10 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </div>
                <h3 className="text-sm font-bold text-white">Deploy Node</h3>
              </div>
              
              <div
                className={`bg-white/[0.02] border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center transition-colors group ${!isAdmin && !hasPerm('permission.users.manage') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04] cursor-pointer'}`}
                onClick={() => {
                  if (!isAdmin && !hasPerm('permission.users.manage')) {
                    ToastMsgs.error('❌ Check permission: permission.users.manage');
                    return;
                  }
                  setIsUserModalOpen(true);
                }}
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 mb-3 group-hover:scale-110 group-hover:bg-white/10 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-emerald-400"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-white">Access Control</h3>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Data Grid (Rooms Table) ────────────────────────────────────── */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl backdrop-blur-xl overflow-hidden flex flex-col min-w-0">
          <div className="p-5 border-b border-white/5 flex flex-wrap gap-4 items-center justify-between bg-black/20">
            <h2 className="text-base font-bold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012-2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              Network Topology
            </h2>

            <div className="flex items-center gap-3">
              {selectedRows.length > 0 && (
                <button
                  className={`text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${!isAdmin && !hasPerm('permission.room.delete') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-500/20'}`}
                  onClick={() => {
                    if (!isAdmin && !hasPerm('permission.room.delete')) {
                      ToastMsgs.error('❌ Check permission: permission.room.delete');
                      return;
                    }
                    handleBulkDelete();
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Purge ({selectedRows.length})
                </button>
              )}
              <button className={`text-xs font-bold text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 ${isFetching ? 'animate-spin' : ''}`} onClick={() => refetch()} disabled={isFetching} title="Sync Grid">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>
          </div>

          <div className="p-0 custom-dark-table w-full overflow-x-auto">
            {roomsData.length > 0 ? (
              <Table
                columns={columns}
                data={roomsData}
                rowKey="room_id"
                showRowNumbers
                showCheckbox
                zebra={false}
                selectedRows={selectedRows}
                onRowSelect={handleRowSelect}
                onSelectAll={handleSelectAll}
                showSearch
                showPagination
                itemsPerPage={10}
                defaultSortKey="room_id"
                actions={[
                  {
                    icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                    title: 'Inspect',
                    variant: 'info',
                    onClick: (row) => handleViewDetails(row?.room_id),
                  },
                  {
                    icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>,
                    title: 'Monitor Feed',
                    variant: 'success',
                    onClick: async (row) => {
                      if (!isAdmin && !hasPerm('permission.view.video')) {
                        ToastMsgs.error('❌ Check permission: permission.view.video');
                        return;
                      }
                      await MakeCall(row?.room_id);
                    },
                  },
                  {
                    render: (row) => {
                      const isActive = row?.active === 'Active' || row?.active === true;
                      if (!isActive) return null;
                      return (
                        <button
                          className={`btn btn-ghost btn-xs text-rose-400 ${!isAdmin && !hasPerm('permission.room.delete') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-500/20'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isAdmin && !hasPerm('permission.room.delete')) {
                              ToastMsgs.error('❌ Check permission: permission.room.delete');
                              return;
                            }
                            handleDropRoomCall(row?.room_id);
                          }}
                          title="Terminate Connection"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        </button>
                      );
                    }
                  },
                  {
                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                    title: 'Purge Node',
                    variant: 'error',
                    onClick: (row) => {
                      if (!isAdmin && !hasPerm('permission.room.delete')) {
                        ToastMsgs.error('❌ Check permission: permission.room.delete');
                        return;
                      }
                      handleDeleteRoom(row?.room_id);
                    },
                  },
                  {
                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
                    title: 'Force Sync',
                    variant: 'warning',
                    onClick: async (row) => await triggerRemoteRefresh(row?.room_id, row?.room_id),
                  },
                ].filter(Boolean)}
              />
            ) : (
              <div className="text-center py-24 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-300">Topology Empty</h3>
                <p className="text-gray-500 text-sm mt-1 mb-6">No nodes currently active on the network.</p>
                {isAdmin && (
                  <button className="px-6 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors" onClick={() => setIsModalOpen(true)}>Initialize Node</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Video Modal ─────────────────────────────────────── */}
      <VideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        roomId={selectedRoomId}
        remoteStreams={remoteStreams}
        peerNames={peerNames}
        roomProducers={producersList}
        isCallActive={isCallActive}
        onEndCall={endCall}
        onReconnect={handleReconnect}
        onRemoteAction={sendRemoteAction}
      />

      {/* ─── Create Room Modal (Cyberpunk styled) ──────────────── */}
      <dialog className={`modal ${isModalOpen ? 'modal-open' : ''} modal-bottom sm:modal-middle`}>
        <div className="modal-box bg-[#111] border border-white/10 p-0 overflow-hidden shadow-2xl rounded-2xl max-w-md">
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 p-6 border-b border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
            <h3 className="font-black text-xl text-white relative z-10">Deploy Node</h3>
            <p className="text-gray-400 text-xs mt-1 relative z-10 font-medium">Establish a secure WebRTC broadcast vector.</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            <div className="form-control">
              <label className="label px-0">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Node Identifier</span>
              </label>
              <input
                {...register('roomId')}
                type="text"
                className={`w-full bg-black/50 border ${errors.roomId ? 'border-rose-500/50 focus:ring-rose-500/20' : 'border-white/10 focus:border-blue-500/50 focus:ring-blue-500/20'} rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-4 transition-all font-mono text-sm`}
                placeholder="e.g. vector-alpha-01"
                autoFocus
                disabled={isSubmitting || createRoom.isPending}
              />
              {errors.roomId && (
                <div className="mt-2 flex items-center gap-1.5 text-rose-400 text-xs font-bold">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <span>{errors.roomId.message}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 font-bold text-sm text-gray-300 transition-colors" onClick={() => { setIsModalOpen(false); reset(); }} disabled={isSubmitting || createRoom.isPending}>Abort</button>
              <button type="submit" className="flex-1 py-3 rounded-xl bg-white text-black hover:bg-gray-200 font-bold text-sm transition-colors" disabled={!!errors.roomId || !roomId || isSubmitting || createRoom.isPending}>
                {isSubmitting || createRoom.isPending ? <span className="loading loading-spinner loading-sm"></span> : 'Execute'}
              </button>
            </div>
          </form>
        </div>
        <div className="modal-backdrop bg-black/80 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); reset(); }}></div>
      </dialog>

      {/* ─── Room Detail Modal (Cyberpunk styled) ──────────────── */}
      <dialog className={`modal ${isDetailModalOpen ? 'modal-open' : ''} modal-bottom sm:modal-middle`}>
        <div className="modal-box w-11/12 max-w-5xl bg-[#0a0a0a] border border-white/10 p-0 overflow-hidden shadow-2xl rounded-2xl">

          <div className="bg-white/[0.02] p-5 border-b border-white/10 flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-1/4 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/10 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-400 uppercase tracking-widest">Node Inspection</h3>
                <div className="font-mono text-lg text-white mt-0.5">{selectedRoomId}</div>
              </div>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 transition-colors z-10" onClick={() => { setIsDetailModalOpen(false); setSelectedRoomId(''); }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="p-6">
            {isRoomDetailLoading || isProducersLoading || isConsumersLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <span className="loading loading-ring loading-lg text-blue-500"></span>
                <span className="text-xs font-mono text-gray-500 mt-4 uppercase tracking-widest">Scanning Node Data...</span>
              </div>
            ) : roomDetail ? (
              <div className="space-y-6">

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Core Status</div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${roomDetail.active ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`}></span>
                      <span className={`font-bold ${roomDetail.active ? 'text-emerald-400' : 'text-rose-400'}`}>{roomDetail.active ? 'Active' : 'Offline'}</span>
                    </div>
                  </div>
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Router Hash</div>
                    <div className="font-mono text-sm text-gray-300 truncate">{roomDetail.routerId}</div>
                  </div>
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute bottom-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl"></div>
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 relative z-10">Uplinks (Producers)</div>
                    <div className="text-3xl font-black text-white relative z-10">{producersList.length}</div>
                  </div>
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute bottom-0 right-0 w-16 h-16 bg-purple-500/10 rounded-full blur-xl"></div>
                    <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2 relative z-10">Downlinks (Consumers)</div>
                    <div className="text-3xl font-black text-white relative z-10">{consumersList.length}</div>
                  </div>
                </div>

                <div className="flex bg-black/40 border border-white/5 p-1 rounded-lg w-full max-w-sm mx-auto">
                  <button className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeDetailTab === 'producers' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => setActiveDetailTab('producers')}>Uplinks ({producersList.length})</button>
                  <button className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeDetailTab === 'consumers' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`} onClick={() => setActiveDetailTab('consumers')}>Downlinks ({consumersList.length})</button>
                </div>

                <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden min-h-[300px] relative">
                  <div className="overflow-x-auto w-full p-2">
                    {activeDetailTab === 'producers' && (
                      producersList.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="text-xs font-bold uppercase tracking-widest">No Uplinks Detected</span>
                        </div>
                      ) : (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/5 text-gray-500 text-[10px] uppercase tracking-widest">
                              <th className="px-4 py-3 font-medium">Hash ID</th>
                              <th className="px-4 py-3 font-medium">Stream Type</th>
                              <th className="px-4 py-3 font-medium">Source</th>
                              <th className="px-4 py-3 font-medium">Socket Hash</th>
                              <th className="px-4 py-3 font-medium">State</th>
                              <th className="px-4 py-3 font-medium text-right">Overrides</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-gray-300">
                            {producersList.map((producer: any) => (
                              <tr key={producer.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 font-mono text-xs">{producer.id.slice(0, 8)}...</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${producer.kind === 'video' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>{producer.kind}</span>
                                </td>
                                <td className="px-4 py-3 text-xs">{producer.source}</td>
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{producer.socketId.slice(0, 8)}...</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${producer.paused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                    <span className="text-xs font-medium">{producer.paused ? 'Suspended' : 'Live'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button className="p-1.5 rounded bg-white/5 hover:bg-amber-500/20 text-gray-400 hover:text-amber-400 transition-colors border border-transparent hover:border-amber-500/30" onClick={() => handleRemoteRefresh(producer.socketId)} title="Force Refresh">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </button>
                                    <button className="p-1.5 rounded bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors border border-transparent hover:border-rose-500/30" onClick={() => handleForceCloseProducer(producer.id)} title="Terminate Uplink">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}

                    {activeDetailTab === 'consumers' && (
                      consumersList.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                          <span className="text-xs font-bold uppercase tracking-widest">No Downlinks Active</span>
                        </div>
                      ) : (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/5 text-gray-500 text-[10px] uppercase tracking-widest">
                              <th className="px-4 py-3 font-medium">Hash ID</th>
                              <th className="px-4 py-3 font-medium">Uplink Target</th>
                              <th className="px-4 py-3 font-medium">Stream Type</th>
                              <th className="px-4 py-3 font-medium">Socket Hash</th>
                              <th className="px-4 py-3 font-medium">State</th>
                              <th className="px-4 py-3 font-medium text-right">Overrides</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-gray-300">
                            {consumersList.map((consumer: any) => (
                              <tr key={consumer.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 font-mono text-xs">{consumer.id.slice(0, 8)}...</td>
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{consumer.producerId.slice(0, 8)}...</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${consumer.kind === 'video' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>{consumer.kind}</span>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{consumer.socketId.slice(0, 8)}...</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${consumer.paused ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                    <span className="text-xs font-medium">{consumer.paused ? 'Suspended' : 'Live'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button className="p-1.5 rounded bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors border border-transparent hover:border-rose-500/30 inline-flex" onClick={() => handleForceCloseConsumer(consumer.id)} title="Terminate Downlink">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-24 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-white">Data Corrupted</h3>
                <p className="text-gray-500 text-sm mt-1">Unable to resolve node telemetry data.</p>
              </div>
            )}
          </div>
        </div>
        <div className="modal-backdrop bg-black/80 backdrop-blur-sm" onClick={() => { setIsDetailModalOpen(false); setSelectedRoomId(''); }}></div>
      </dialog>


      {/* ─── Confirmation Modal (Cyberpunk styled) ──────────────── */}
      <dialog className={`modal ${confirmModal.isOpen ? 'modal-open' : ''} modal-bottom sm:modal-middle`}>
        <div className="modal-box bg-[#111] border border-white/10 p-0 overflow-hidden shadow-2xl rounded-2xl max-w-sm text-center">
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 p-6 border-b border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-white relative z-10">
              {confirmModal.action === 'start' && <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>}
              {confirmModal.action === 'stop' && <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>}
              {confirmModal.action === 'restart' && <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>}
            </div>
            <h3 className="font-black text-xl text-white relative z-10">
              {confirmModal.action === 'start' ? 'Start SFU Core' : confirmModal.action === 'stop' ? 'Halt SFU Core' : 'Restart SFU Core'}
            </h3>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-gray-400 text-sm font-medium">
              Are you sure you want to {confirmModal.action} the SFU server?
              {confirmModal.action !== 'start' && " This will terminate all active connections and drop ongoing broadcasts."}
            </p>
            <div className="flex gap-3 pt-2">
              <button type="button" className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 font-bold text-sm text-gray-300 transition-colors" onClick={() => setConfirmModal({ isOpen: false, action: null })} disabled={startSFU.isPending || stopSFU.isPending || restartSFU.isPending}>Abort</button>
              <button type="button" className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors text-white ${confirmModal.action === 'start' ? 'bg-emerald-600 hover:bg-emerald-500' : confirmModal.action === 'stop' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-blue-600 hover:bg-blue-500'}`} onClick={executeConfirmAction} disabled={startSFU.isPending || stopSFU.isPending || restartSFU.isPending}>
                {startSFU.isPending || stopSFU.isPending || restartSFU.isPending ? <span className="loading loading-spinner loading-sm"></span> : 'Execute'}
              </button>
            </div>
          </div>
        </div>
        <div className="modal-backdrop bg-black/80 backdrop-blur-sm" onClick={() => setConfirmModal({ isOpen: false, action: null })}></div>
      </dialog>

      {/* ─── User Management Modal ───────────────────────────────── */}
      <dialog className={`modal ${isUserModalOpen ? 'modal-open' : ''}`}>
        <div className="modal-box bg-[#111] border border-white/10 p-0 overflow-hidden shadow-2xl rounded-2xl max-w-5xl w-11/12 max-h-[85vh] flex flex-col">
          <div className="bg-black/40 px-6 py-4 border-b border-white/5 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
            <div>
              <h3 className="font-black text-xl text-white tracking-tight flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                Access Control Directory
              </h3>
              <p className="text-gray-400 text-xs mt-1 font-medium uppercase tracking-widest">Manage User Permissions and View Shared Links</p>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 transition-colors" onClick={() => setIsUserModalOpen(false)}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
          
          <div className="flex border-b border-white/5 bg-[#111] px-6 pt-2">
            <button 
              className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeAdminTab === 'users' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              onClick={() => setActiveAdminTab('users')}
            >
              Manage Users
            </button>
            <button 
              className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeAdminTab === 'permissions' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              onClick={() => setActiveAdminTab('permissions')}
            >
              Manage Permissions
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            {activeAdminTab === 'users' ? (
              isUsersLoading ? (
                <div className="flex justify-center items-center py-20">
                  <span className="loading loading-spinner loading-lg text-emerald-500"></span>
                </div>
              ) : (
              <div className="custom-dark-table">
                <Table
                  columns={userColumns}
                  data={usersData || []}
                  rowKey="id"
                  showSearch
                  showPagination
                  itemsPerPage={5}
                  zebra={false}
                />
              </div>
              )
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-6 bg-white/[0.02] border border-white/10 rounded-xl p-5">
                  <h4 className="text-white font-bold mb-4">{editingPermission?.id ? 'Edit Permission' : 'Create New Permission'}</h4>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 mb-1 block">Permission Name</label>
                      <input 
                        type="text" 
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        placeholder="e.g., MANAGE_ROOMS"
                        value={editingPermission?.name || ''}
                        onChange={(e) => setEditingPermission(prev => ({ ...prev, name: e.target.value.toUpperCase() } as any))}
                      />
                    </div>
                    <div className="flex-[2]">
                      <label className="text-xs text-gray-400 mb-1 block">Description</label>
                      <input 
                        type="text" 
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        placeholder="Brief description of what this permission allows..."
                        value={editingPermission?.description || ''}
                        onChange={(e) => setEditingPermission(prev => ({ ...prev, description: e.target.value } as any))}
                      />
                    </div>
                    <div className="flex gap-2">
                      {editingPermission?.id && (
                        <button 
                          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold transition-colors"
                          onClick={() => setEditingPermission(null)}
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!editingPermission?.name}
                        onClick={() => {
                          if (editingPermission?.id) {
                            updatePermission.mutate({ id: editingPermission.id, name: editingPermission.name, description: editingPermission.description });
                          } else if (editingPermission?.name) {
                            createPermission.mutate({ name: editingPermission.name, description: editingPermission.description });
                          }
                          setEditingPermission(null);
                        }}
                      >
                        {editingPermission?.id ? 'Save Changes' : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="custom-dark-table mt-4 flex-1 overflow-y-auto">
                  <Table
                    columns={permissionColumns}
                    data={permissionsData || []}
                    rowKey="id"
                    showSearch
                    showPagination
                    itemsPerPage={5}
                    zebra={false}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-backdrop bg-black/80 backdrop-blur-sm" onClick={() => setIsUserModalOpen(false)}></div>
      </dialog>

      {/* Deep style overrides for generic Table component to enforce dark Cyberpunk aesthetic */}
      <style>{`
        .custom-dark-table {
           --p: 217 90% 61%; /* primary blue */
           --bc: 215 28% 17%; /* base content -> white/gray */
        }
        .custom-dark-table .bg-base-100 {
           background-color: rgba(0,0,0,0.4) !important;
        }
        .custom-dark-table .border-base-200 {
           border-color: rgba(255,255,255,0.1) !important;
        }
        .custom-dark-table .bg-base-200\\/70 {
           background-color: rgba(255,255,255,0.03) !important;
        }
        .custom-dark-table .bg-base-200\\/50 {
           background-color: transparent !important;
        }
        .custom-dark-table .border-base-300 {
           border-color: rgba(255,255,255,0.05) !important;
        }
        .custom-dark-table .text-base-content {
           color: #d1d5db !important;
        }
        .custom-dark-table .text-base-content\\/30,
        .custom-dark-table .text-base-content\\/40,
        .custom-dark-table .text-base-content\\/50 {
           color: #9ca3af !important;
        }
        .custom-dark-table input.input-bordered {
           background-color: rgba(0,0,0,0.5) !important;
           border-color: rgba(255,255,255,0.1) !important;
           color: white !important;
        }
        .custom-dark-table input.input-bordered:focus {
           border-color: rgba(59,130,246,0.5) !important;
           outline: 0px !important;
        }
        .custom-dark-table table {
           color: #e5e7eb;
        }
        .custom-dark-table thead th {
           background-color: rgba(0,0,0,0.3) !important;
           color: #9ca3af !important;
           font-size: 0.65rem;
           text-transform: uppercase;
           letter-spacing: 0.05em;
           border-bottom: 1px solid rgba(255,255,255,0.1) !important;
        }
        .custom-dark-table tbody tr {
           border-bottom: 1px solid rgba(255,255,255,0.05) !important;
           background-color: transparent !important;
        }
        /* Hard override to destroy DaisyUI light-mode zebra striping if it bleeds through */
        .custom-dark-table tbody tr:nth-child(even),
        .custom-dark-table tbody tr:nth-child(odd) {
           background-color: transparent !important;
        }
        .custom-dark-table tbody tr:hover {
           background-color: rgba(255,255,255,0.02) !important;
        }
        .custom-dark-table th,
        .custom-dark-table td {
           white-space: nowrap;
        }
        /* Hide scrollbars for cleaner mobile scrolling */
        .custom-dark-table::-webkit-scrollbar {
           display: none;
        }
        .custom-dark-table {
           -ms-overflow-style: none;  /* IE and Edge */
           scrollbar-width: none;  /* Firefox */
        }
        .custom-dark-table .btn-ghost {
           color: #9ca3af !important;
        }
        .custom-dark-table .btn-ghost:hover {
           background-color: rgba(255,255,255,0.1) !important;
           color: white !important;
        }
        .custom-dark-table .btn-primary {
           background-color: rgba(59,130,246,0.8) !important;
           border-color: rgba(59,130,246,1) !important;
           color: white !important;
        }
        .custom-dark-table .join-item {
           background-color: rgba(0,0,0,0.5) !important;
           border-color: rgba(255,255,255,0.1) !important;
           color: #9ca3af !important;
        }
        .custom-dark-table .join-item:hover:not(.btn-disabled) {
           background-color: rgba(255,255,255,0.1) !important;
           color: white !important;
        }
        /* Custom Checkbox override */
        .custom-dark-table .checkbox {
           border-color: rgba(255,255,255,0.2) !important;
        }
        .custom-dark-table .checkbox:checked {
           background-color: #3b82f6 !important;
           border-color: #3b82f6 !important;
        }
        /* Label text override */
        .custom-dark-table .badge-ghost {
           background-color: rgba(255,255,255,0.05) !important;
           color: #9ca3af !important;
           border: 1px solid rgba(255,255,255,0.1) !important;
        }

        /* Mobile Responsive Card Grid Layout */
        @media (max-width: 768px) {
           .custom-dark-table table, 
           .custom-dark-table tbody, 
           .custom-dark-table tr, 
           .custom-dark-table td {
              display: block;
              width: 100%;
           }
           .custom-dark-table thead {
              display: none;
           }
           .custom-dark-table tr {
              margin-bottom: 1rem;
              background-color: rgba(0,0,0,0.2) !important;
              border: 1px solid rgba(255,255,255,0.1) !important;
              border-radius: 1rem;
              padding: 0.5rem;
           }
           .custom-dark-table td {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid rgba(255,255,255,0.05) !important;
              padding: 0.75rem 1rem !important;
              text-align: right;
           }
           .custom-dark-table td:last-child {
              border-bottom: none !important;
           }
           .custom-dark-table td::before {
              content: attr(data-label);
              font-size: 0.65rem;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #9ca3af;
              font-weight: 700;
              text-align: left;
              margin-right: 1rem;
           }
           /* Specific fix for Actions cell */
           .custom-dark-table td[data-label="Actions"] {
              justify-content: space-between;
           }
           .custom-dark-table td[data-label="Actions"] > div {
              justify-content: flex-end;
              flex: 1;
           }
        }
      `}</style>
    </div>
  );

};

export default SfuTest;
