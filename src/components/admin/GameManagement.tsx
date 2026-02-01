import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Calendar, Plus, Trash2, Users } from 'lucide-react';
import type { Tables } from '@/lib/database.types';

type Game = Tables<'games'>;

export function GameManagement() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchGames();
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

  const createTestGame = async () => {
    setCreating(true);
    try {
      // Create a game for next Saturday
      const today = new Date();
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
      const nextSaturday = new Date(today);
      nextSaturday.setDate(today.getDate() + daysUntilSaturday);
      const gameDate = nextSaturday.toISOString().split('T')[0];

      // Create proper timestamps for candle lighting and shabbat end
      const candleLighting = new Date(nextSaturday);
      candleLighting.setHours(16, 45, 0, 0);
      
      const shabbatEnd = new Date(nextSaturday);
      shabbatEnd.setHours(17, 45, 0, 0);

      const { error } = await supabase.from('games').insert({
        date: gameDate,
        kickoff_time: '18:45:00',
        deadline_time: '19:00:00',
        status: 'open_for_all',
        candle_lighting: candleLighting.toISOString(),
        shabbat_end: shabbatEnd.toISOString(),
      });

      if (error) throw error;

      toast.success('משחק לבדיקה נוצר בהצלחה!');
      fetchGames();
    } catch (error: any) {
      toast.error('שגיאה ביצירת משחק', { description: error.message });
    } finally {
      setCreating(false);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
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
        <CardContent className="space-y-4">
          <Button
            onClick={createTestGame}
            disabled={creating}
            className="w-full gap-2 neon-glow"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                צור משחק לבדיקה (שבת הקרובה)
              </>
            )}
          </Button>
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
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{formatDate(game.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {game.kickoff_time.slice(0, 5)}
                      </p>
                    </div>
                    {getStatusBadge(game.status)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteGame(game.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
