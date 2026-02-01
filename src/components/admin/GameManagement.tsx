import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Calendar, Plus, Trash2, Users, Bot, FlaskConical, Wand2 } from 'lucide-react';
import { CreateGameForm } from './CreateGameForm';
import { createWeeklyGame } from '@/lib/autoGameCreation';
import type { Tables } from '@/lib/database.types';

type Game = Tables<'games'>;

export function GameManagement() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingAuto, setCreatingAuto] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
