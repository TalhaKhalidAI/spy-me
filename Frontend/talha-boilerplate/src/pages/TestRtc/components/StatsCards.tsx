// src/pages/TestRtc/components/StatsCards.tsx

import React from 'react';
import type { Stats } from '../types';
import { motion } from 'framer-motion';

interface StatsCardsProps {
  stats: Stats | undefined;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    { 
      label: 'Rooms', 
      value: stats?.total_rooms || 0, 
      color: 'blue',
      icon: '🏠',
      gradient: 'from-blue-500/20 to-blue-600/20 border-blue-500/20'
    },
    { 
      label: 'Peers', 
      value: stats?.total_peers || 0, 
      color: 'green',
      icon: '👥',
      gradient: 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/20'
    },
    { 
      label: 'Tracks', 
      value: stats?.total_tracks || 0, 
      color: 'purple',
      icon: '🎵',
      gradient: 'from-purple-500/20 to-purple-600/20 border-purple-500/20'
    },
    { 
      label: 'Max Peers', 
      value: stats?.max_peers || 0, 
      color: 'pink',
      icon: '📊',
      gradient: 'from-pink-500/20 to-pink-600/20 border-pink-500/20'
    },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
          className={`px-5 py-2.5 rounded-2xl bg-gradient-to-br ${card.gradient} border backdrop-blur-sm`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{card.icon}</span>
            <div>
              <p className="text-xs text-slate-400">{card.label}</p>
              <p className="text-xl font-bold text-white">{card.value}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}