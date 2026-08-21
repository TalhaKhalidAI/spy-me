// src/pages/TestRtc/components/TracksTable.tsx

import React from 'react';
import { useTracks, useEnableTrack, useRemoveTrack } from '../query';
import type { Track } from '../types';
import {
  Box,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Typography
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';

interface TracksTableProps {
  selectedPeer: string;
  setSelectedPeer: (peer: string) => void;
}

export function TracksTable({ selectedPeer, setSelectedPeer }: TracksTableProps) {
  const tracksQuery = useTracks(selectedPeer);
  const enableTrack = useEnableTrack();
  const removeTrack = useRemoveTrack();

  if (!selectedPeer) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        Enter a peer ID to view tracks.
      </Alert>
    );
  }

  if (tracksQuery.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={128}>
        <CircularProgress />
      </Box>
    );
  }

  const tracks = tracksQuery.data?.tracks || [];

  return (
    <Box>
      <Box display="flex" gap={2} mb={4}>
        <TextField
          fullWidth
          size="small"
          label="Peer ID"
          value={selectedPeer}
          onChange={(e) => setSelectedPeer(e.target.value)}
        />
        <Button
          variant="contained"
          color="secondary"
          startIcon={tracksQuery.isFetching ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
          onClick={() => tracksQuery.refetch()}
          disabled={tracksQuery.isFetching}
          sx={{ minWidth: 120 }}
        >
          Refresh
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell>Track ID</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tracks.map((track: Track) => (
              <TableRow key={track.track_id}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {track.track_id.substring(0, 12)}...
                </TableCell>
                <TableCell>
                  <Chip 
                    label={track.kind} 
                    size="small" 
                    color={track.kind === 'video' ? 'info' : 'success'} 
                  />
                </TableCell>
                <TableCell>
                  <Chip 
                    icon={track.enabled ? <CheckCircleIcon /> : <CancelIcon />}
                    label={track.enabled ? 'Enabled' : 'Disabled'} 
                    size="small" 
                    color={track.enabled ? 'success' : 'error'} 
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    variant="outlined"
                    color={track.enabled ? 'warning' : 'success'}
                    onClick={() => {
                      enableTrack.mutate({
                        peerId: selectedPeer,
                        trackId: track.track_id,
                        enabled: !track.enabled,
                      });
                    }}
                    disabled={enableTrack.isPending}
                    sx={{ mr: 1 }}
                  >
                    {track.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      if (confirm(`Remove track "${track.track_id}"?`)) {
                        removeTrack.mutate({
                          peerId: selectedPeer,
                          trackId: track.track_id,
                        });
                      }
                    }}
                    disabled={removeTrack.isPending}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tracks.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                  <Typography variant="h4" mb={1}>🎵</Typography>
                  <Typography color="text.secondary">No tracks found for this peer.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}