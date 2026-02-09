"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGameRealtime, type GameRealtimeEvent } from '@/hooks/useGameRealtime';
import { toast } from 'sonner';
import { Loader2, Calendar, Clock, Users, UserPlus, UserMinus, CheckCircle2, QrCode } from 'lucide-react';
import { QrScanner } from '@/components/QrScanner';
import { PlayerList } from './PlayerList';
import { LiveBadge } from './LiveBadge';
import type { Tables } from '@/lib/database.types';

type Game = Tables<'games'>;
type Registration = Tables<'registrations'> & {
  full_name: string | null;
  avatar_url: string | null;
  is_resident?: boolean | null;
  is_waiting?: boolean;
  display_position?: number;
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
  const [finishing, setFinishing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [lateModalOpen, setLateModalOpen] = useState(false);
  const [lateMinutesInput, setLateMinutesInput] = useState('');
  const [lateSaving, setLateSaving] = useState(false);
  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [earlyTimeInput, setEarlyTimeInput] = useState('');
  const [earlySaving, setEarlySaving] = useState(false);

  const maxPlayersRaw = currentGame?.max_players ?? DEFAULT_MAX_PLAYERS;
  const maxPlayers = Math.max(0, maxPlayersRaw);

  const fetchCurrentGame = useCallback(async () => {
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
  }, []);

  const fetchRegistrations = useCallback(async () => {
    if (!currentGame) return;

    try {
      // Step 1: Fetch registrations without JOIN
      const { data: regsData, error: regsError } = await supabase
        .from('registrations')
        .select('*')
        .eq('game_id', currentGame.id)
        .order('queue_position', { ascending: true, nullsFirst: false })
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
        .select('id, full_name, avatar_url, is_resident')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Step 4: Create a map for quick lookup
      const profilesMap = new Map(
        (profilesData || []).map(p => [
          p.id,
          { full_name: p.full_name, avatar_url: p.avatar_url, is_resident: p.is_resident },
        ])
      );

      // Step 5: Merge data
      const mergedRegistrations: Registration[] = regsData.map(reg => ({
        ...reg,
        full_name: profilesMap.get(reg.user_id)?.full_name || null,
        avatar_url: profilesMap.get(reg.user_id)?.avatar_url || null,
        is_resident: profilesMap.get(reg.user_id)?.is_resident ?? null,
      }));

      const activeOrStandby = mergedRegistrations.filter((r) => r.status === 'active' || r.status === 'standby');
      const combinedSorted = activeOrStandby.slice().sort((a, b) => {
        const aPos = a.queue_position ?? Number.MAX_SAFE_INTEGER;
        const bPos = b.queue_position ?? Number.MAX_SAFE_INTEGER;
        if (aPos !== bPos) return aPos - bPos;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      const positionMap = new Map<string, number>();
      combinedSorted.forEach((r, index) => {
        positionMap.set(r.id, index + 1);
      });
      const withDisplayPosition = (registration: Registration): Registration => {
        const fallbackPosition = positionMap.get(registration.id);
        const validPosition =
          typeof registration.queue_position === 'number' &&
          registration.queue_position > 0 &&
          registration.queue_position <= combinedSorted.length;
        return {
          ...registration,
          display_position: validPosition ? registration.queue_position : fallbackPosition,
        };
      };

      const registrationsWithPositions = mergedRegistrations.map(withDisplayPosition);
      setRegistrations(registrationsWithPositions);
      const myReg = user
        ? registrationsWithPositions.find((r) => r.user_id === user.id && r.status !== 'cancelled') || null
        : null;
      setUserRegistration(myReg);
    } catch (error: any) {
      console.error('Error fetching registrations:', error);
    }
  }, [currentGame, user]);

  useEffect(() => {
    fetchCurrentGame();
  }, [fetchCurrentGame]);

  useEffect(() => {
    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    const schedule = () => {
      const nowDate = new Date();
      setNow(nowDate);
      const msToNextTick = 1000 - nowDate.getMilliseconds();
      timeoutId = window.setTimeout(() => {
        setNow(new Date());
        intervalId = window.setInterval(() => setNow(new Date()), 1000);
      }, msToNextTick);
    };

    schedule();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    if (currentGame) {
      fetchRegistrations();
    } else {
      setRegistrations([]);
      setUserRegistration(null);
    }
  }, [currentGame, fetchRegistrations]);

  const handleRealtimeEvent = useCallback(
    (event: GameRealtimeEvent) => {
      if (event.type === 'registrations') {
        fetchRegistrations();
        return;
      }

      if (event.type === 'game_updated') {
        fetchCurrentGame();
        return;
      }

      if (event.type === 'game_deleted') {
        setCurrentGame(null);
        setRegistrations([]);
        setUserRegistration(null);
      }
    },
    [fetchRegistrations, fetchCurrentGame]
  );

  useGameRealtime(currentGame?.id ?? null, handleRealtimeEvent);

  const parseGameTimestamp = (value?: string | null): Date | null => {
    if (!currentGame || !value) return null;
    const isoValue = value.includes('T') ? value : `${currentGame.date}T${value}`;
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const wave1OpensAt = parseGameTimestamp(currentGame?.wave1_registration_opens_at);
  const wave2OpensAt = parseGameTimestamp(currentGame?.registration_opens_at);
  const kickoffAt = parseGameTimestamp(currentGame?.kickoff_time);
  const isWave1Open = wave1OpensAt ? now >= wave1OpensAt : false;
  const isWave2Open = wave2OpensAt ? now >= wave2OpensAt : false;
  const checkInOpensAt = kickoffAt
    ? new Date(kickoffAt.getTime() - 30 * 60 * 1000)
    : null;
  const isCheckInOpen = checkInOpensAt ? now >= checkInOpensAt : false;
  const isGameLive = kickoffAt ? now >= kickoffAt : false;

  const canRegister = () => {
    if (!currentGame) return false;

    // Wave 2: Open for all - check timestamp first
    if (isWave2Open) return true;

    // Wave 1: Allow everyone to register, non-residents enter as waiting
    if (isWave1Open) return true;
    
    // Fallback to status field for backward compatibility
    if (currentGame.status === 'open_for_residents') {
      return profile?.is_resident === true;
    }
    
    return currentGame.status === 'open_for_all';
  };

  const getRegistrationStatusText = () => {
    if (!currentGame) return 'ההרשמה סגורה';

    // Wave 2: Open for all
    if (isWave2Open) {
      return 'הירשם למשחק';
    }

    // Wave 1: Residents + waiting list for non-residents
    if (isWave1Open) {
      return profile?.is_resident ? 'הירשם למשחק' : 'הירשם (בהמתנה)';
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
    if (!currentGame) {
      return { allowed: false, message: 'אין משחק פעיל' };
    }

    if (currentGame.status === 'cancelled') {
      return { allowed: false, message: 'המשחק בוטל' };
    }

    if (kickoffAt && !isCheckInOpen) {
      return { allowed: false, message: 'צ׳ק-אין נפתח חצי שעה לפני המשחק' };
    }

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

      toast.success('נרשמת למשחק! לא לשכוח לבצע צ\'ק אין בהגעתך למגרש', {
        description: newStatus === 'standby' ? 'אתה ברשימת ההמתנה' : undefined,
      });
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

  const handleFinish = async () => {
    if (!userRegistration || !user || !currentGame) return;
    if (userRegistration.status !== 'active') return;

    setFinishing(true);
    try {
      const { error } = await supabase.rpc('finish_registration_for_game', {
        _game_id: currentGame.id,
      });

      if (error) throw error;

      toast.success('סיימת את המשחק');
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בעדכון סיום המשחק', { description: error.message });
    } finally {
      setFinishing(false);
    }
  };

  const openLateModal = () => {
    if (!userRegistration) return;
    setLateMinutesInput(
      userRegistration.eta_minutes && userRegistration.eta_minutes > 0
        ? String(userRegistration.eta_minutes)
        : ''
    );
    setLateModalOpen(true);
  };

  const openEarlyModal = () => {
    if (!userRegistration) return;
    const existing = formatTimeInputValue(userRegistration.early_finish_time);
    setEarlyTimeInput(existing || getDefaultEarlyTime());
    setEarlyModalOpen(true);
  };

  const saveLateNotice = async () => {
    if (!currentGame || !userRegistration) return;
    if (userRegistration.check_in_status === 'checked_in') {
      toast.error('לא ניתן לעדכן איחור אחרי צ׳ק-אין');
      return;
    }

    const trimmed = lateMinutesInput.trim();
    const minutesValue = trimmed.length > 0 ? Number(trimmed) : null;

    if (trimmed.length > 0) {
      if (!Number.isFinite(minutesValue) || minutesValue <= 0) {
        toast.error('יש להזין מספר דקות חיובי');
        return;
      }
      if (!Number.isInteger(minutesValue)) {
        toast.error('יש להזין מספר דקות שלם');
        return;
      }
    }

    setLateSaving(true);
    try {
      const { error } = await supabase.rpc('update_registration_notice', {
        _game_id: currentGame.id,
        _is_late: true,
        _eta_minutes: minutesValue,
        _is_early_finish: userRegistration.is_early_finish ?? false,
        _early_finish_time: userRegistration.early_finish_time ?? null,
      });

      if (error) throw error;

      toast.success('עודכן איחור');
      setLateModalOpen(false);
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בעדכון איחור', { description: error.message });
    } finally {
      setLateSaving(false);
    }
  };

  const clearLateNotice = async () => {
    if (!currentGame || !userRegistration) return;
    setLateSaving(true);
    try {
      const { error } = await supabase.rpc('update_registration_notice', {
        _game_id: currentGame.id,
        _is_late: false,
        _eta_minutes: null,
        _is_early_finish: userRegistration.is_early_finish ?? false,
        _early_finish_time: userRegistration.early_finish_time ?? null,
      });

      if (error) throw error;

      toast.success('איחור בוטל');
      setLateModalOpen(false);
      setLateMinutesInput('');
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בביטול איחור', { description: error.message });
    } finally {
      setLateSaving(false);
    }
  };

  const saveEarlyFinishNotice = async () => {
    if (!currentGame || !userRegistration) return;

    const trimmed = earlyTimeInput.trim();
    const timeValue = trimmed.length > 0 ? trimmed : null;

    setEarlySaving(true);
    try {
      const { error } = await supabase.rpc('update_registration_notice', {
        _game_id: currentGame.id,
        _is_late: userRegistration.is_late ?? false,
        _eta_minutes: userRegistration.eta_minutes ?? null,
        _is_early_finish: true,
        _early_finish_time: timeValue,
      });

      if (error) throw error;

      toast.success('עודכן סיום מוקדם');
      setEarlyModalOpen(false);
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בעדכון סיום מוקדם', { description: error.message });
    } finally {
      setEarlySaving(false);
    }
  };

  const clearEarlyFinishNotice = async () => {
    if (!currentGame || !userRegistration) return;

    setEarlySaving(true);
    try {
      const { error } = await supabase.rpc('update_registration_notice', {
        _game_id: currentGame.id,
        _is_late: userRegistration.is_late ?? false,
        _eta_minutes: userRegistration.eta_minutes ?? null,
        _is_early_finish: false,
        _early_finish_time: null,
      });

      if (error) throw error;

      toast.success('סיום מוקדם בוטל');
      setEarlyModalOpen(false);
      fetchRegistrations();
    } catch (error: any) {
      toast.error('שגיאה בביטול סיום מוקדם', { description: error.message });
    } finally {
      setEarlySaving(false);
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

  const formatTimeInputFromDate = (date: Date) => {
    const pad2 = (num: number) => num.toString().padStart(2, '0');
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  };

  const formatTimeInputValue = (value?: string | null) => {
    if (!value) return '';
    if (value.includes('T')) {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return formatTimeInputFromDate(d);
    }
    return value.slice(0, 5);
  };

  const roundToNextFiveMinutes = (date: Date) => {
    const ms = 5 * 60 * 1000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };

  const getDefaultEarlyTime = () => formatTimeInputFromDate(roundToNextFiveMinutes(new Date()));

  const formatRegistrationTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad2 = (num: number) => num.toString().padStart(2, '0');
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    const seconds = pad2(date.getSeconds());
    const centiseconds = pad2(Math.floor(date.getMilliseconds() / 10));
    return `${hours}:${minutes}:${seconds}.${centiseconds}`;
  };

  const isBeforeWave2 = wave2OpensAt ? now < wave2OpensAt : false;

  const withWaitingStatus = (registration: Registration): Registration => ({
    ...registration,
    is_waiting:
      isBeforeWave2 &&
      registration.status === 'active' &&
      registration.is_resident === false,
  });

  const activeRegistrations = registrations
    .filter((r) => r.status === 'active')
    .slice()
    .sort((a, b) => {
      const aPos = a.display_position ?? a.queue_position ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.display_position ?? b.queue_position ?? Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
    .map(withWaitingStatus);

  const standbyRegistrations = registrations
    .filter((r) => r.status === 'standby')
    .slice()
    .sort((a, b) => {
      const aPos = a.display_position ?? a.queue_position ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.display_position ?? b.queue_position ?? Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
    .map(withWaitingStatus);
  const cancelledRegistrations = registrations
    .filter((r) => r.status === 'cancelled')
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const finishedRegistrations = registrations
    .filter((r) => r.status === 'finished')
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const isRegistered = !!userRegistration;
  const isFinished = userRegistration?.status === 'finished';
  const isNoShow = userRegistration?.check_in_status === 'no_show';
  const isCheckedIn = userRegistration?.check_in_status === 'checked_in';
  const isUserWaiting =
    isBeforeWave2 &&
    userRegistration?.status === 'active' &&
    userRegistration?.is_resident === false;
  const isLate = userRegistration?.is_late === true;
  const isEarlyFinish = userRegistration?.is_early_finish === true;
  const isActiveOrStandby =
    userRegistration?.status === 'active' || userRegistration?.status === 'standby';
  const showLateBadge = isActiveOrStandby && isLate && !isCheckedIn;
  const showEarlyFinishBadge = isActiveOrStandby && isEarlyFinish;
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
            <div className="flex items-center gap-2">
              {isGameLive && <LiveBadge />}
              {getStatusBadge()}
            </div>
          </div>
          <CardDescription>{formatDate(currentGame.date)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Time Info */}
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>משחק ראשון: {formatTime(currentGame.kickoff_time)}</span>
              </div>
              {currentGame.deadline_time && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>שמירת מקומות עד: {formatTime(currentGame.deadline_time)}</span>
                </div>
              )}
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
                    {userRegistration.status === 'finished'
                      ? 'סיימת את המשחק!'
                      : userRegistration.status === 'active'
                        ? 'אתה רשום למשחק!'
                        : 'אתה ברשימת ההמתנה'}
                  </p>
                  {!isFinished && (
                    <p className="text-xs text-muted-foreground">
                      מיקומך בתור:{' '}
                      {userRegistration.display_position ??
                        userRegistration.queue_position ??
                        registrations.findIndex((r) => r.id === userRegistration.id) + 1}
                    </p>
                  )}
                  <Badge variant="outline" className="mt-2 text-xs">
                    נרשמת בשעה {formatRegistrationTime(userRegistration.created_at)}
                  </Badge>
                  {isFinished ? (
                    <Badge className="mt-1 bg-blue-600 text-white border-blue-600/70">
                      סיימת את המשחק
                    </Badge>
                  ) : isNoShow ? (
                    <Badge className="mt-1 bg-red-600 text-white border-red-600/70">
                      לא הגעת למשחק
                    </Badge>
                  ) : (
                    isCheckedIn && (
                      <Badge className="mt-1 bg-green-500/20 text-green-500 border-green-500/50">
                        ✓ עשית צ&apos;ק-אין
                      </Badge>
                    )
                  )}
                  {isUserWaiting && (
                    <Badge className="mt-1 bg-amber-500/20 text-amber-600 border-amber-500/50">
                      בהמתנה לפתיחת ההרשמה לכולם
                    </Badge>
                  )}
                  {showLateBadge && (
                    <Badge className="mt-1 bg-red-500/20 text-red-500 border-red-500/50">
                      {userRegistration.eta_minutes && userRegistration.eta_minutes > 0
                        ? `מאחר ${userRegistration.eta_minutes}ד'`
                        : 'מאחר'}
                    </Badge>
                  )}
                  {showEarlyFinishBadge && (
                    <Badge className="mt-1 bg-indigo-500/20 text-indigo-500 border-indigo-500/50">
                      {userRegistration.early_finish_time
                        ? `מסיים ב-${formatTime(userRegistration.early_finish_time)}`
                        : 'מסיים מוקדם'}
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
          ) : isFinished ? (
            <div className="text-sm text-muted-foreground">
              סיימת את המשחק להיום.
            </div>
          ) : (
            <div className="space-y-2">
              {/* QR Scanner for Check-in - Available for any registered player who hasn't checked in */}
              {!isCheckedIn && (
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
              {isActiveOrStandby && !isCheckedIn && (
                <Button
                  variant="outline"
                  onClick={openLateModal}
                  className="w-full gap-2"
                >
                  עדכן איחור
                </Button>
              )}
              {isActiveOrStandby && (
                <Button
                  variant="outline"
                  onClick={openEarlyModal}
                  className="w-full gap-2"
                >
                  מסיים מוקדם
                </Button>
              )}
              {isGameLive && userRegistration?.status === 'active' && isCheckedIn && (
                <Button
                  variant="secondary"
                  onClick={handleFinish}
                  disabled={finishing}
                  className="w-full gap-2"
                >
                  {finishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'סיימתי את המשחק'
                  )}
                </Button>
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
        showPosition
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

      {cancelledRegistrations.length > 0 && (
        <PlayerList
          title="ביטלו הרשמה"
          players={cancelledRegistrations}
          showPosition={false}
          emptyMessage="אין שחקנים שביטלו הרשמה"
        />
      )}

      {finishedRegistrations.length > 0 && (
        <PlayerList
          title="סיימו"
          players={finishedRegistrations}
          showPosition={false}
          emptyMessage="אין שחקנים שסיימו את המשחק"
        />
      )}

      <Dialog open={lateModalOpen} onOpenChange={setLateModalOpen}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-right">עדכן איחור</DialogTitle>
            <DialogDescription className="text-right">
              אפשר לבחור דקות איחור או להשאיר ללא דקות.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>צ׳יפים מהירים</Label>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20, 30].map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={lateMinutesInput === String(value) ? 'default' : 'outline'}
                    onClick={() => setLateMinutesInput(String(value))}
                  >
                    {value} דק׳
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={lateMinutesInput === '' ? 'default' : 'outline'}
                  onClick={() => setLateMinutesInput('')}
                >
                  ללא דקות
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="late-minutes-input">דקות איחור</Label>
              <Input
                id="late-minutes-input"
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                placeholder="למשל 12"
                value={lateMinutesInput}
                onChange={(event) => setLateMinutesInput(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <Button onClick={saveLateNotice} disabled={lateSaving}>
              {lateSaving ? 'שומר...' : 'שמירה'}
            </Button>
            <Button variant="ghost" onClick={clearLateNotice} disabled={lateSaving}>
              בטל איחור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={earlyModalOpen} onOpenChange={setEarlyModalOpen}>
        <DialogContent className="sm:max-w-md text-right" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-right">מסיים מוקדם</DialogTitle>
            <DialogDescription className="text-right">
              בחר שעה לסיום מוקדם או השאר ללא שעה.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="early-time-input">שעת סיום</Label>
              <Input
                id="early-time-input"
                type="time"
                step={300}
                value={earlyTimeInput}
                onChange={(event) => setEarlyTimeInput(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setEarlyTimeInput('')}
            >
              ללא שעה
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-row-reverse">
            <Button onClick={saveEarlyFinishNotice} disabled={earlySaving}>
              {earlySaving ? 'שומר...' : 'שמירה'}
            </Button>
            <Button variant="ghost" onClick={clearEarlyFinishNotice} disabled={earlySaving}>
              בטל סיום מוקדם
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
