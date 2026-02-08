"use client";

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type GameRealtimeEvent =
  | { type: 'registrations' }
  | { type: 'game_updated' }
  | { type: 'game_deleted' };

const DEFAULT_DEBOUNCE_MS = 250;

export function useGameRealtime(
  gameId: string | null,
  onDataUpdate: (event: GameRealtimeEvent) => void
) {
  const onDataUpdateRef = useRef(onDataUpdate);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onDataUpdateRef.current = onDataUpdate;
  }, [onDataUpdate]);

  useEffect(() => {
    if (!gameId) {
      return undefined;
    }

    const channel = supabase.channel(`game-${gameId}-realtime`);

    const triggerRegistrations = () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        onDataUpdateRef.current({ type: 'registrations' });
      }, DEFAULT_DEBOUNCE_MS);
    };

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'registrations',
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        triggerRegistrations();
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      },
      () => {
        onDataUpdateRef.current({ type: 'game_updated' });
      }
    );

    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      },
      () => {
        onDataUpdateRef.current({ type: 'game_deleted' });
      }
    );

    channel.subscribe();

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [gameId]);
}
