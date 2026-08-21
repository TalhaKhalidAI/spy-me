// src/pages/TestRtc/index.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useRooms, useRoom, useStats, useCreateRoom, useDeleteRoom } from './query';
import { RoomCard } from './components/RoomCard';
import { PeerCard } from './components/PeerCard';
import { SignalingPanel } from './components/SignalingPanel';
import { TracksTable } from './components/TracksTable';

import {
  Box,
  Typography,
  Stack,
  IconButton,
  Button,
  Grid,
  Card,
  CardContent,
  Avatar,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress
} from '@mui/material';

import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Home as HomeIcon,
  Group as GroupIcon,
  SettingsInputAntenna as SignalIcon,
  LibraryMusic as TracksIcon,
} from '@mui/icons-material';

const statIcons = [
  <HomeIcon />, <GroupIcon />, <TracksIcon />, <GroupIcon />
];

function TestRtc() {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('rooms');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');

  const statsQuery = useStats();
  const roomsQuery = useRooms();
  const roomQuery = useRoom(selectedRoom || '');
  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();

  useEffect(() => {
    if (roomsQuery.data?.rooms?.length && !selectedRoom) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedRoom(roomsQuery.data.rooms[0]);
    }
  }, [roomsQuery.data, selectedRoom]);

  const stats = statsQuery.data;
  const rooms = roomsQuery.data?.rooms || [];

  const statCards = useMemo(() => [
    { title: 'Rooms', value: stats?.total_rooms ?? 0, icon: statIcons[0], color: '#4f46e5' },
    { title: 'Peers', value: stats?.total_peers ?? 0, icon: statIcons[1], color: '#10b981' },
    { title: 'Tracks', value: stats?.total_tracks ?? 0, icon: statIcons[2], color: '#f59e0b' },
    { title: 'Max Peers', value: stats?.max_peers ?? 100, icon: statIcons[3], color: '#ef4444' },
  ], [stats]);

  if (statsQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            📡 WebRTC Control
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {rooms.length} rooms · {stats?.total_peers ?? 0} peers · {stats?.total_tracks ?? 0} tracks
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton sx={{ bgcolor: 'white', boxShadow: 1 }} onClick={() => {
            statsQuery.refetch();
            roomsQuery.refetch();
          }}>
            <RefreshIcon color="primary" />
          </IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setIsCreateModalOpen(true)}>
            New Room
          </Button>
        </Stack>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        {statCards.map((stat, index) => (
          <Grid item xs={12} sm={6} lg={3} key={index}>
            <Card sx={{ borderRadius: 3, boxShadow: 2 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ color: stat.color, mb: 0.5 }}>
                      {stat.value}
                    </Typography>
                  </Box>
                  <Avatar sx={{
                    bgcolor: `${stat.color}15`,
                    color: stat.color,
                    width: 48,
                    height: 48
                  }}>
                    {stat.icon}
                  </Avatar>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab value="rooms" label="Rooms" icon={<HomeIcon />} iconPosition="start" />
          <Tab value="peers" label="Peers" icon={<GroupIcon />} iconPosition="start" />
          <Tab value="signaling" label="Signaling" icon={<SignalIcon />} iconPosition="start" />
          <Tab value="tracks" label="Tracks" icon={<TracksIcon />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <Box>
        {activeTab === 'rooms' && (
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">All Rooms</Typography>
              <Typography variant="body2" color="text.secondary">{rooms.length} available</Typography>
            </Box>
            {rooms.length > 0 ? (
              <Grid container spacing={3}>
                {rooms.map((roomId: string) => (
                  <Grid item xs={12} sm={6} md={4} key={roomId}>
                    <RoomCard
                      roomId={roomId}
                      isSelected={selectedRoom === roomId}
                      onSelect={() => {
                        setSelectedRoom(roomId);
                        setActiveTab('peers');
                      }}
                      onDelete={() => {
                        if (confirm(`Delete room "${roomId}"?`)) {
                          deleteRoom.mutate(roomId);
                          if (selectedRoom === roomId) setSelectedRoom(null);
                        }
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Box textAlign="center" py={5}>
                <Typography variant="h3" mb={2}>🏗️</Typography>
                <Typography variant="h6">No Rooms Yet</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>Create your first room to start.</Typography>
                <Button variant="contained" onClick={() => setIsCreateModalOpen(true)}>Create Room</Button>
              </Box>
            )}
          </Box>
        )}

        {activeTab === 'peers' && (
          <PeerCard
            roomId={selectedRoom || ''}
            roomQuery={roomQuery}
            onRefresh={() => {}}
            selectedPeer={selectedPeer}
            setSelectedPeer={setSelectedPeer}
          />
        )}

        {activeTab === 'signaling' && (
          <SignalingPanel
            selectedPeer={selectedPeer || ''}
            setSelectedPeer={setSelectedPeer}
          />
        )}

        {activeTab === 'tracks' && (
          <TracksTable
            selectedPeer={selectedPeer || ''}
            setSelectedPeer={setSelectedPeer}
          />
        )}
      </Box>

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Room</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>Configure your communication channel</Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Room ID *"
            type="text"
            fullWidth
            variant="outlined"
            value={newRoomId}
            onChange={(e) => setNewRoomId(e.target.value)}
            helperText="Letters, numbers, underscores, hyphens only"
          />
          <TextField
            margin="dense"
            label="Password (optional)"
            type="password"
            fullWidth
            variant="outlined"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
          <Button 
            variant="contained"
            disabled={createRoom.isPending || !newRoomId}
            onClick={() => {
              createRoom.mutate(
                { room_id: newRoomId, password: roomPassword || undefined },
                {
                  onSuccess: () => {
                    setNewRoomId('');
                    setRoomPassword('');
                    setIsCreateModalOpen(false);
                  },
                }
              );
            }}
          >
            {createRoom.isPending ? <CircularProgress size={24} /> : 'Create Room'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TestRtc;