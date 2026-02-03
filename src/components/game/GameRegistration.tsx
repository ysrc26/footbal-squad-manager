"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Calendar, Clock, Users, UserPlus, UserMinus, CheckCircle2, QrCode } from 'lucide-react';
import { QrScanner } from '@/components/QrScanner';
import { PlayerList } from './PlayerList';
import type { Tables } from '@/lib/database.types';

type Game = Tables<'games'>;
type Registration = Tables<'registrations'> & {
  full_name: string | null;
  avatar_url: string | null;
};

// Fallback values for games without max_players/max_standby
const DEFAULT_MAX_PLAYERS = 15;

export function GameRegistration() {
  const { user, profile } = useAuth();
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [userRegistration, setUserRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  // Use dynamic max_players from game or fallback to default
  const maxPlayers = currentGame?.max_players ?? DEFAULT_MAX_PLAYERS;

  const fetchCurrentGame = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .gte('date', today)
        .in('status', ['scheduled', 'open_for_residents', 'open_for_all'])
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setCurrentGame(data);
    } catch (error: any) {
      console.error('Error fetching game:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrations = useCallback(async () => {
    if (!currentGame) return;

    try {
      // Step 1: Fetch registrations without JOIN
      const { data: regsData, error: regsError } = await supabase
        .from('registrations')
        .select('*')
        .eq('game_id', currentGame.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      if (regsError) throw regsError;

      if (!regsData || regsData.length === 0) {
        setRegistrations([]);
        setUserRegistration(null);
        return;
      }

      // Step 2: Get unique user IDs
      const userIds = [...new Set(regsData.map(r => r.user_id))];

      // Step 3: Fetch profiles for those users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Step 4: Create a map for quick lookup
      const profilesMap = new Map(
        (profilesData || []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
      );

      // Step 5: Merge data
      const mergedRegistrations: Registration[] = regsData.map(reg => ({
        ...reg,
        full_name: profilesMap.get(reg.user_id)?.full_name || null,
        avatar_url: profilesMap.get(reg.user_id)?.avatar_url || null,
      }));

      setRegistrations(mergedRegistrations);
      const myReg = user ? mergedRegistrations.find((r) => r.user_id === user.id) || null : null;
      setUserRegistration(myReg);
    } catch (error: any) {
      console.error('Error fetching registrations:', error);
    }
  }, [currentGame, user]);

  useEffect(() => {
    fetchCurrentGame();
  }, []);

  useEffect(() => {
    if (currentGame) {
      fetchRegistrations();
      // Subscribe to real-time updates
      const channel = supabase
        .channel('registrations-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'registrations',
            filter: `game_id=eq.${currentGame.id}`,
          },
          () => {
            fetchRegistrations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentGame, fetchRegistrations]);

  const canRegister = () => {
    if (!currentGame) return false;
    
    const now = new Date();
    
    // Wave 2: Open for all - check timestamp first
    if (currentGame.registration_opens_at) {
      const wave2Opens = new Date(currentGame.registration_opens_at);
      if (now >= wave2Opens) {
        return true;
      }
    }
    
    // Wave 1: Open for residents only
    if (currentGame.wave1_registration_opens_at) {
      const wave1Opens = new Date(currentGame.wave1_registration_opens_at);
      if (now >= wave1Opens && profile?.is_resident) {
        return true;
      }
    }
    
    // Fallback to status field for backward compatibility
    if (currentGame.status === 'open_for_residents') {
      return profile?.is_resident === true;
    }
    
    return currentGame.status === 'open_for_all';
  };

  const getRegistrationStatusText = () => {
    if (!currentGame) return 'ההרשמה סגורה';
    
    const now = new Date();
    
    // Wave 2: Open for all
    if (currentGame.registration_opens_at) {
      const wave2Opens = new Date(currentGame.registration_opens_at);
      if (now >= wave2Opens) {
        return 'הירשם למשחק';
      }
    }
    
    // Wave 1: Open for residents only
    if (currentGame.wave1_registration_opens_at) {
      const wave1Opens = new Date(currentGame.wave1_registration_opens_at);
      if (now >= wave1Opens) {
        return profile?.is_resident ? 'הירשם למשחק' : 'ההרשמה פתוחה לתושבים בלבד';
      }
    }
    
    // Fallback to status field
    if (currentGame.status === 'open_for_all') {
      return 'הירשם למשחק';
    }
    if (currentGame.status === 'open_for_residents') {
      return profile?.is_resident ? 'הירשם למשחק' : 'ההרשמה פתוחה לתושבים בלבד';
    }
    
    return 'ההרשמה סגורה';
  };

  const canCheckIn = (): { allowed: boolean; message: string } => {
    if (!currentGame?.kickoff_time) {
      return { allowed: false, message: 'זמן המשחק לא מוגדר' };
    }
    
    const kickoff = new Date(currentGame.kickoff_time);
    const now = new Date();
    const minutesUntilKickoff = (kickoff.getTime() - now.getTime()) / (1000 * 60);
    
    // Check-in opens 20 minutes before kickoff
    if (minutesUntilKickoff > 20) {
      const totalMinutes = minutesUntilKickoff;
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const mins = Math.round(totalMinutes % 60);
      
      let timeStr = '';
      if (days > 0) {
        timeStr = `${days} ${days === 1 ? 'יום' : 'ימים'}`;
        if (hours > 0) timeStr += `, ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
        if (mins > 0) timeStr += ` ו-${mins} דקות`;
      } else if (hours > 0) {
        timeStr = `${hours} ${hours === 1 ? 'שעה' : 'שעות'} ו-${mins} דקות`;
      } else {
        timeStr = `${mins} דקות`;
      }
      
      return { 
        allowed: false, 
        message: `צ'ק-אין ייפתח בעוד ${timeStr}` 
      };
    }
    
    // For auto-generated games: check-in closes at midnight after Shabbat
    if (currentGame.is_auto_generated) {
      const gameDate = new Date(currentGame.date);
      // Midnight after the game date (Sunday 00:00)
      const midnight = new Date(gameDate);
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 0, 0);
      
      if (now > midnight) {
        return { allowed: false, message: 'זמן הצ\'ק-אין הסתיים' };
      }
    }
    // For manual games: check-in is always open until game is deleted
    // (no additional closing condition needed)
    
    return { allowed: true, message: 'סרוק QR לצ\'ק-אין' };
  };

  const handleRegister = async () => {
    if (!currentGame || !user || !canRegister()) return;

    // Prevent duplicate registration (only for active registrations shown in UI)
    if (userRegistration) {
      toast.error('אתה כבר רשום למשחק זה');
      return;
    }

    setRegistering(true);
    try {
      const { data, error } = await supabase.rpc('register_for_game', {
        _game_id: currentGame.id,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      const newStatus = result?.status ?? 'active';

      toast.success(
        newStatus === 'active'
          ? 'נרשמת בהצלחה! 🎉'
          : 'נוספת לרשימת ההמתנה 📝'
      );
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בהרשמה', { description: error.message });
    } finally {
      setRegistering(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!userRegistration || !user || !currentGame) return;

    setRegistering(true);
    try {
      const { error } = await supabase.rpc('cancel_registration_for_game', {
        _game_id: currentGame.id,
      });

      if (error) throw error;

      toast.success('ההרשמה בוטלה');
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בביטול', { description: error.message });
    } finally {
      setRegistering(false);
    }
  };

  const getStatusBadge = () => {
    if (!currentGame) return null;

    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      scheduled: { label: 'מתוכנן', variant: 'secondary' },
      open_for_residents: { label: 'פתוח לתושבים', variant: 'default' },
      open_for_all: { label: 'פתוח לכולם', variant: 'default' },
      closed: { label: 'סגור להרשמה', variant: 'destructive' },
    };

    const status = statusMap[currentGame.status] || { label: currentGame.status, variant: 'outline' as const };
    return <Badge variant={status.variant}>{status.label}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatTime = (value: string) => {
    if (!value) return '';
    // Support both TIME strings ("18:45:00") and ISO timestamps
    if (value.includes('T')) {
      const d = new Date(value);
      return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    }
    return value.slice(0, 5);
  };

  const activeRegistrations = registrations.filter((r) => r.status === 'active');
  const standbyRegistrations = registrations
    .filter((r) => r.status === 'standby')
    .slice()
    .sort((a, b) => {
      const aPos = a.queue_position ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.queue_position ?? Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  const isRegistered = !!userRegistration;
  const isCheckedIn = userRegistration?.check_in_status === 'checked_in';
  const checkInStatus = canCheckIn();

  if (loading) {
    return (
      <Card className="glass animate-fade-in">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!currentGame) {
    return (
      <Card className="glass animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            המשחק הבא
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground text-lg">אין משחקים מתוכננים כרגע</p>
          <p className="text-sm text-muted-foreground mt-2">המשחק הבא ייווצר אוטומטית</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Game Info Card */}
      <Card className="glass neon-border animate-fade-in">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              המשחק הבא
            </CardTitle>
            {getStatusBadge()}
          </div>
          <CardDescription>{formatDate(currentGame.date)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Time Info */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>התחלה: {formatTime(currentGame.kickoff_time)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{activeRegistrations.length}/{maxPlayers}</span>
            </div>
          </div>

          {/* Registration Status */}
          {isRegistered && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-primary">
                    {userRegistration.status === 'active' ? 'אתה רשום למשחק!' : 'אתה ברשימת ההמתנה'}
                  </p>
                  {userRegistration.status === 'standby' && (
                    <p className="text-xs text-muted-foreground">
                      מיקום בתור:{' '}
                      {userRegistration.queue_position ??
                        standbyRegistrations.findIndex((r) => r.id === userRegistration.id) + 1}
                    </p>
                  )}
                  {isCheckedIn && (
                    <Badge className="mt-1 bg-green-500/20 text-green-500 border-green-500/50">
                      ✓ עשית צ&apos;ק-אין
                    </Badge>
                  )}
                  {userRegistration.eta_minutes && userRegistration.eta_minutes > 0 && (
                    <Badge className="mt-1 bg-red-500/20 text-red-500 border-red-500/50">
                      מאחר {userRegistration.eta_minutes}ד&apos;
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Registration Button */}
          {!isRegistered ? (
            <Button
              onClick={handleRegister}
              disabled={registering || !canRegister()}
              className="w-full h-12 text-lg font-semibold neon-glow gap-2"
            >
              {registering ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-5 w-5" />
                  {getRegistrationStatusText()}
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-2">
              {/* QR Scanner for Check-in - Only for registered active players who haven't checked in */}
              {userRegistration.status === 'active' && !isCheckedIn && (
                checkInStatus.allowed ? (
                  <QrScanner gameId={currentGame.id} onCheckInSuccess={fetchRegistrations} />
                ) : (
                  <Button
                    disabled
                    className="w-full h-14 text-lg font-semibold gap-3"
                  >
                    <QrCode className="h-6 w-6" />
                    {checkInStatus.message}
                  </Button>
                )
              )}
              {/* Cancel button - always available for registered players */}
              <Button
                variant="outline"
                onClick={handleCancelRegistration}
                disabled={registering}
                className="w-full gap-2"
              >
                {registering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserMinus className="h-4 w-4" />
                    בטל הרשמה
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Player Lists */}
      <PlayerList
        title="שחקנים רשומים"
        players={activeRegistrations}
        maxPlayers={maxPlayers}
        emptyMessage="אין שחקנים רשומים עדיין"
      />

      {standbyRegistrations.length > 0 && (
        <PlayerList
          title="מזמינים"
          players={standbyRegistrations}
          showPosition
          emptyMessage="אין מזמינים"
        />
      )}
    </div>
  );
}
