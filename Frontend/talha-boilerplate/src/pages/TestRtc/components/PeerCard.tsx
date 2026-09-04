// src/pages/TestRtc/components/PeerCard.tsx

import React, { useState } from 'react';
import { useCreatePeer, useDeletePeer, useTracks } from '../query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Room, Peer } from '../types';

import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Select,
  MenuItem,
  Button,
  Grid,
  IconButton,
  Chip,
  Stack,
  CircularProgress,
  Avatar
} from '@mui/material';
import {
  Close as CloseIcon,
  Person as PersonIcon,
  LibraryMusic as TracksIcon,
  AccessTime as TimeIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Call as CallIcon,
  CallEnd as CallEndIcon
} from '@mui/icons-material';

import { ActiveCallViewer } from './ActiveCallViewer';

interface PeerCardProps {
  roomId: string;
  roomQuery: UseQueryResult<Room>;
  onRefresh: () => void;
  selectedPeer: string | null;
  setSelectedPeer: (peer: string | null) => void;
}

export function PeerCard({ roomId, roomQuery, selectedPeer, setSelectedPeer }: PeerCardProps) {
  const [newPeerId, setNewPeerId] = useState('');
  const [role, setRole] = useState<'both' | 'publisher' | 'subscriber'>('both');
  const [activeCallPeer, setActiveCallPeer] = useState<string | null>(null);

  const createPeer = useCreatePeer();
  const deletePeer = useDeletePeer();
  const tracksQuery = useTracks(selectedPeer || '');

  const room = roomQuery.data;

  return (
    <Box>
      {/* Create Peer */}
      <Card sx={{ mb: 4, borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom color="secondary.main" display="flex" alignItems="center">
            ✦ Add Peer to {roomId}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              size="small"
              placeholder="Peer ID (auto if empty)"
              value={newPeerId}
              onChange={(e) => setNewPeerId(e.target.value)}
              fullWidth
            />
            <Select
              size="small"
              value={role}
              onChange={(e) => setRole(e.target.value as 'both' | 'publisher' | 'subscriber')}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="both">Both</MenuItem>
              <MenuItem value="publisher">Publisher</MenuItem>
              <MenuItem value="subscriber">Subscriber</MenuItem>
            </Select>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => {
                createPeer.mutate({
                  roomId,
                  data: { peer_id: newPeerId || undefined, role },
                });
                setNewPeerId('');
              }}
              disabled={createPeer.isPending}
            >
              {createPeer.isPending ? <CircularProgress size={24} /> : 'Add Peer'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Peer Grid */}
      <Grid container spacing={3}>
        {room?.peers?.map((peer: Peer) => (
          <Grid item xs={12} md={6} lg={4} key={peer.peer_id}>
            <Card
              variant="outlined"
              onClick={() => setSelectedPeer(peer.peer_id)}
              sx={{
                cursor: 'pointer',
                borderRadius: 2,
                transition: 'all 0.2s',
                borderColor: selectedPeer === peer.peer_id ? 'secondary.main' : 'divider',
                boxShadow: selectedPeer === peer.peer_id ? 3 : 1,
              }}
            >
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Avatar sx={{ bgcolor: 'secondary.light', width: 32, height: 32 }}>
                      <PersonIcon fontSize="small" />
                    </Avatar>
                    <Typography variant="subtitle2" fontFamily="monospace" fontWeight="bold">
                      {peer.peer_id}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <IconButton
                      size="small"
                      color={activeCallPeer === peer.peer_id ? "error" : "primary"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCallPeer(activeCallPeer === peer.peer_id ? null : peer.peer_id);
                        setSelectedPeer(peer.peer_id);
                      }}
                      sx={{ mr: 1, border: '1px solid' }}
                    >
                      {activeCallPeer === peer.peer_id ? <CallEndIcon fontSize="small" /> : <CallIcon fontSize="small" />}
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Disconnect peer "${peer.peer_id}"?`)) {
                          deletePeer.mutate(peer.peer_id);
                        }
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
                  <Chip label={peer.role} size="small" variant="outlined" />
                  <Chip icon={<TracksIcon />} label={`${peer.track_count} tracks`} size="small" variant="outlined" />
                  {peer.connected_at && (
                    <Chip icon={<TimeIcon />} label={new Date(peer.connected_at).toLocaleTimeString()} size="small" variant="outlined" />
                  )}
                </Stack>

                {selectedPeer === peer.peer_id && tracksQuery.data && (
                  <Box mt={2} p={1.5} bgcolor="action.hover" borderRadius={1}>
                    <Typography variant="caption" fontWeight="bold" gutterBottom display="block">
                      Tracks:
                    </Typography>
                    {tracksQuery.data.tracks.map((t) => (
                      <Box key={t.track_id} display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="caption">{t.kind}</Typography>
                        {t.enabled ? <CheckCircleIcon color="success" fontSize="small" /> : <CancelIcon color="error" fontSize="small" />}
                      </Box>
                    ))}
                    {tracksQuery.data.tracks.length === 0 && (
                      <Typography variant="caption" color="text.secondary">No tracks</Typography>
                    )}
                  </Box>
                )}
                
                {/* Embedded WebRTC Call Viewer */}
                {activeCallPeer === peer.peer_id && (
                  <Box mt={2} pt={2} borderTop="1px solid" borderColor="divider">
                    <ActiveCallViewer roomId={roomId} targetPeer={peer.peer_id} />
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
        {(!room?.peers || room.peers.length === 0) && (
          <Grid item xs={12}>
            <Box textAlign="center" py={5}>
              <Typography variant="h3" mb={2}>👻</Typography>
              <Typography color="text.secondary">No peers in this room yet.</Typography>
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}