// src/pages/TestRtc/components/RoomCard.tsx

import React, { useState } from 'react';
import { useRoom, useRoomStats } from '../query';
import { formatDistance } from 'date-fns';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  Skeleton,
  Stack
} from '@mui/material';
import {
  Delete as DeleteIcon,
  BarChart as StatsIcon,
  Group as GroupIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon
} from '@mui/icons-material';

interface RoomCardProps {
  roomId: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function RoomCard({ roomId, isSelected, onSelect, onDelete }: RoomCardProps) {
  const roomQuery = useRoom(roomId);
  const roomStatsQuery = useRoomStats(roomId);
  const [showStats, setShowStats] = useState(false);

  if (roomQuery.isLoading) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent>
          <Skeleton variant="text" width="75%" height={32} />
          <Skeleton variant="text" width="50%" />
        </CardContent>
      </Card>
    );
  }

  const room = roomQuery.data;
  const stats = roomStatsQuery.data;

  return (
    <Card 
      variant="outlined" 
      onClick={onSelect}
      sx={{ 
        cursor: 'pointer',
        borderRadius: 2,
        transition: 'all 0.2s',
        borderColor: isSelected ? 'primary.main' : 'divider',
        boxShadow: isSelected ? 3 : 1,
        '&:hover': {
          boxShadow: 3,
          borderColor: isSelected ? 'primary.main' : 'text.disabled'
        }
      }}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1} overflow="hidden">
            <Typography variant="h6" noWrap>
              {roomId}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {room?.created_at && formatDistance(new Date(room.created_at), new Date(), { addSuffix: true })}
            </Typography>
          </Box>
          <Box display="flex" gap={0.5}>
            <IconButton 
              size="small" 
              onClick={(e) => { e.stopPropagation(); setShowStats(!showStats); }}
            >
              <StatsIcon fontSize="small" />
            </IconButton>
            <IconButton 
              size="small" 
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
          <Chip 
            icon={<GroupIcon />} 
            label={`${room?.peer_count || 0} peers`} 
            size="small" 
            variant="outlined" 
          />
          <Chip 
            icon={room?.password_protected ? <LockIcon /> : <LockOpenIcon />} 
            label={room?.password_protected ? 'Protected' : 'Open'} 
            size="small" 
            color={room?.password_protected ? 'warning' : 'success'}
            variant="outlined"
          />
        </Stack>

        {showStats && stats && (
          <Box mt={2} pt={2} borderTop={1} borderColor="divider">
            <Stack direction="row" spacing={2}>
              <Box bgcolor="action.hover" p={1} borderRadius={1} flex={1}>
                <Typography variant="caption" color="text.secondary">Max Peers</Typography>
                <Typography variant="body1" fontWeight="bold">{stats.max_peers}</Typography>
              </Box>
              <Box bgcolor="action.hover" p={1} borderRadius={1} flex={1}>
                <Typography variant="caption" color="text.secondary">Connected</Typography>
                <Typography variant="body1" fontWeight="bold" color="success.main">
                  {stats.peers?.filter(p => p.connected_seconds > 0).length || 0}
                </Typography>
              </Box>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}