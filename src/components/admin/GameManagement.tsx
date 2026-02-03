"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Calendar, Plus, Trash2, Users, Bot, FlaskConical, Wand2 } from 'lucide-react';
import { CreateGameForm } from './CreateGameForm';
import { createWeeklyGame } from '@/lib/autoGameCreation';
import type { Tables } from '@/lib/database.types';

type Game = Tables<'games'>;

type TestConfig = {
  maxPlayers: number;
  maxStandby: number;
  activeCount: number;
  standbyCount: number;
  kickoffTime: string;
  deadlineTime: string;
};

const TEST_STORAGE_KEY = 'admin_test_game_setup';

const pad = (value: number) => String(value).padStart(2, '0');

const toLocalInputValue = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function GameManagement() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingAuto, setCreatingAuto] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [swapRunningId, setSwapRunningId] = useState<string | null>(null);
  const [swapResults, setSwapResults] = useState<Record<string, { count: number; users: string[] }>>({});
  const [testGameId, setTestGameId] = useState<string | null>(null);
  const [testUserIds, setTestUserIds] = useState<string[]>([]);
  const [testBatchId, setTestBatchId] = useState<string | null>(null);
  const [testCreating, setTestCreating] = useState(false);
  const [testCleaning, setTestCleaning] = useState(false);
  const [testConfig, setTestConfig] = useState<TestConfig>(() => {
    const now = new Date();
    const kickoff = new Date(now.getTime() + 1 * 60 * 1000);
    const deadline = new Date(now.getTime() + 2 * 60 * 1000);
    return {
      maxPlayers: 20,
      maxStandby: 5,
      activeCount: 15,
      standbyCount: 5,
      kickoffTime: toLocalInputValue(kickoff),
      deadlineTime: toLocalInputValue(deadline),
    };
  });

  useEffect(() => {
    fetchGames();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(TEST_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.gameId) setTestGameId(parsed.gameId);
      if (Array.isArray(parsed?.userIds)) {
        setTestUserIds(parsed.userIds);
      } else if (Array.isArray(parsed?.profileIds)) {
        setTestUserIds(parsed.profileIds);
      }
      if (parsed?.batchId) setTestBatchId(parsed.batchId);
    } catch {
      window.localStorage.removeItem(TEST_STORAGE_KEY);
    }
  }, []);

  const fetchGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('date', { ascending: false })
        .limit(10);

      if (error) throw error;
      setGames(data || []);
    } catch (error: any) {
      toast.error('שגיאה בטעינת משחקים', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAutoGame = async () => {
    setCreatingAuto(true);
    try {
      const result = await createWeeklyGame();
      
      if (result.success) {
        toast.success(result.message);
        fetchGames();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error('שגיאה ביצירת משחק אוטומטי', { description: error.message });
    } finally {
      setCreatingAuto(false);
    }
  };

  const deleteGame = async (gameId: string) => {
    try {
      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);

      if (error) throw error;

      toast.success('המשחק נמחק');
      fetchGames();
    } catch (error: any) {
      toast.error('שגיאה במחיקת המשחק', { description: error.message });
    }
  };

  const runLateSwaps = async (gameId: string) => {
    setSwapRunningId(gameId);
    try {
      const { data, error } = await supabase.rpc('process_late_swaps', {
        _game_id: gameId,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      const swaps = Array.isArray(result?.swaps) ? result.swaps : [];
      const count = result?.swaps_count ?? 0;
      const users = swaps
        .flatMap((swap: any) => [swap.promoted_user_id, swap.demoted_user_id])
        .filter(Boolean);

      setSwapResults((prev) => ({
        ...prev,
        [gameId]: {
          count,
          users: Array.from(new Set(users)),
        },
      }));

      toast.success(`בוצעו ${count} החלפות`);
    } catch (error: any) {
      toast.error('שגיאה בהרצת החלפות', { description: error.message });
    } finally {
      setSwapRunningId(null);
    }
  };

  const updateTestConfig = (key: keyof TestConfig, value: string) => {
    setTestConfig((prev) => ({
      ...prev,
      [key]: key.includes('Time') ? value : Number(value),
    }));
  };

  const createTestGame = async () => {
    const maxPlayers = Number(testConfig.maxPlayers);
    const maxStandby = Number(testConfig.maxStandby);
    const activeCount = Number(testConfig.activeCount);
    const standbyCount = Number(testConfig.standbyCount);
    const kickoffDate = new Date(testConfig.kickoffTime);
    const deadlineDate = new Date(testConfig.deadlineTime);

    if (maxPlayers <= 0 || maxStandby < 0) {
      toast.error('יש להזין כמות שחקנים תקינה ומזמינים תקינה');
      return;
    }

    if (activeCount < 0 || standbyCount < 0) {
      toast.error('מספר שחקנים לא יכול להיות שלילי');
      return;
    }

    if (activeCount > maxPlayers) {
      toast.error('מספר השחקנים להרשמה לא יכול לעלות על max_players');
      return;
    }

    if (standbyCount > maxStandby) {
      toast.error('מספר המזמינים לא יכול לעלות על max_standby');
      return;
    }

    if (Number.isNaN(kickoffDate.getTime()) || Number.isNaN(deadlineDate.getTime())) {
      toast.error('זמני kickoff/deadline לא תקינים');
      return;
    }

    if (kickoffDate >= deadlineDate) {
      toast.error('kickoff_time חייב להיות לפני deadline_time');
      return;
    }

    setTestCreating(true);
    try {
      const batchId = crypto.randomUUID().slice(0, 8);
      const { data, error } = await supabase.functions.invoke('admin-test-game-create', {
        body: {
          kickoff_time: kickoffDate.toISOString(),
          deadline_time: deadlineDate.toISOString(),
          max_players: maxPlayers,
          max_standby: maxStandby,
          active_count: activeCount,
          standby_count: standbyCount,
          batch_id: batchId,
        },
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.game_id) {
        throw new Error('תוצאת טסט לא תקינה');
      }

      setTestGameId(result.game_id);
      setTestUserIds(result.user_ids || []);
      setTestBatchId(batchId);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          TEST_STORAGE_KEY,
          JSON.stringify({
            gameId: result.game_id,
            userIds: result.user_ids || [],
            batchId,
          })
        );
      }

      toast.success('משחק טסט נוצר בהצלחה');
      fetchGames();
    } catch (error: any) {
      toast.error('שגיאה ביצירת טסט', { description: error.message });
    } finally {
      setTestCreating(false);
    }
  };

  const cleanupTestGame = async () => {
    if (!testGameId && testUserIds.length === 0) {
      toast.error('לא נמצא משחק טסט לניקוי');
      return;
    }

    setTestCleaning(true);
    try {
      const { error } = await supabase.functions.invoke('admin-test-game-cleanup', {
        body: {
          game_id: testGameId,
          user_ids: testUserIds,
        },
      });

      if (error) throw error;

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(TEST_STORAGE_KEY);
      }

      setTestGameId(null);
      setTestUserIds([]);
      setTestBatchId(null);

      toast.success('טסט נוקה בהצלחה');
      fetchGames();
    } catch (error: any) {
      toast.error('שגיאה בניקוי טסט', { description: error.message });
    } finally {
      setTestCleaning(false);
    }
  };

  const formatUserId = (userId: string) => userId.slice(0, 8);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
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

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      scheduled: { label: 'מתוכנן', variant: 'secondary' },
      open_for_residents: { label: 'לתושבים', variant: 'default' },
      open_for_all: { label: 'פתוח לכולם', variant: 'default' },
      closed: { label: 'סגור', variant: 'destructive' },
      completed: { label: 'הסתיים', variant: 'outline' },
      cancelled: { label: 'בוטל', variant: 'destructive' },
    };

    const s = statusMap[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  const getGameTypeBadge = (game: Game) => {
    if (game.is_auto_generated) {
      return (
        <Badge variant="outline" className="gap-1 text-xs border-primary/50 text-primary">
          <Bot className="h-3 w-3" />
          אוטו
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-500">
        <FlaskConical className="h-3 w-3" />
        בדיקה
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            ניהול משחקים
          </CardTitle>
          <CardDescription>יצירה וניהול משחקים שבועיים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Manual Game Creation Button */}
          <Button
            variant="outline"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="w-full gap-2"
          >
            <Plus className="h-4 w-4" />
            {showCreateForm ? 'סגור טופס' : 'צור משחק ידני לבדיקה'}
          </Button>

          {/* Auto Game Creation Button */}
          <Button
            onClick={handleCreateAutoGame}
            disabled={creatingAuto}
            className="w-full gap-2 neon-glow"
          >
            {creatingAuto ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                צור משחק אוטומטי (לפי זמני שבת)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Create Game Form */}
      {showCreateForm && (
        <CreateGameForm
          onClose={() => setShowCreateForm(false)}
          onGameCreated={fetchGames}
        />
      )}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            פינת טסטים (אדמין)
          </CardTitle>
          <CardDescription>יוצר משחק טסט שמופיע במסך הבית ומדגים החלפות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">max_players</p>
              <Input
                type="number"
                min={1}
                value={testConfig.maxPlayers}
                onChange={(e) => updateTestConfig('maxPlayers', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">max_standby</p>
              <Input
                type="number"
                min={0}
                value={testConfig.maxStandby}
                onChange={(e) => updateTestConfig('maxStandby', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">שחקנים פעילים ליצור</p>
              <Input
                type="number"
                min={0}
                value={testConfig.activeCount}
                onChange={(e) => updateTestConfig('activeCount', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">מזמינים ליצור</p>
              <Input
                type="number"
                min={0}
                value={testConfig.standbyCount}
                onChange={(e) => updateTestConfig('standbyCount', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">kickoff_time</p>
              <Input
                type="datetime-local"
                value={testConfig.kickoffTime}
                onChange={(e) => updateTestConfig('kickoffTime', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">deadline_time</p>
              <Input
                type="datetime-local"
                value={testConfig.deadlineTime}
                onChange={(e) => updateTestConfig('deadlineTime', e.target.value)}
              />
            </div>
          </div>

          {testGameId && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <p>Game ID: {testGameId}</p>
              {testBatchId && <p>Batch: {testBatchId}</p>}
              {testUserIds.length > 0 && <p>Test Users: {testUserIds.length}</p>}
            </div>
          )}

          <div className="flex flex-col gap-2 md:flex-row">
            <Button onClick={createTestGame} disabled={testCreating} className="w-full">
              {testCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'צור משחק טסט'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={cleanupTestGame}
              disabled={testCleaning}
              className="w-full"
            >
              {testCleaning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'נקה משחק טסט'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            משחקים קיימים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {games.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין משחקים במערכת
            </p>
          ) : (
            <div className="space-y-2">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatDate(game.date)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(game.kickoff_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(game.status)}
                      {getGameTypeBadge(game)}
                      <span className="text-xs text-muted-foreground">
                        {game.max_players}/{game.max_standby} שחקנים/המתנה
                      </span>
                    </div>
                    {swapResults[game.id] && (
                      <div className="text-xs text-muted-foreground">
                        החלפות: {swapResults[game.id].count}
                        {swapResults[game.id].users.length > 0 && (
                          <>
                            {' '}
                            | משתמשים:{' '}
                            {swapResults[game.id].users
                              .slice(0, 3)
                              .map(formatUserId)
                              .join(', ')}
                            {swapResults[game.id].users.length > 3 &&
                              ` +${swapResults[game.id].users.length - 3}`}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runLateSwaps(game.id)}
                      disabled={swapRunningId === game.id}
                    >
                      {swapRunningId === game.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'הרץ החלפות מאוחרות'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteGame(game.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
