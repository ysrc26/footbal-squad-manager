"use client";

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import type { GameStatus } from '@/lib/database.types';

interface CreateGameFormProps {
  onClose: () => void;
  onGameCreated: () => void;
}

export function CreateGameForm({ onClose, onGameCreated }: CreateGameFormProps) {
  const [creating, setCreating] = useState(false);
  
  // Form state
  const [gameDate, setGameDate] = useState('');
  const [kickoffTime, setKickoffTime] = useState('18:45');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('19:00');
  const [wave1Date, setWave1Date] = useState('');
  const [wave1Time, setWave1Time] = useState('12:00');
  const [wave2Date, setWave2Date] = useState('');
  const [wave2Time, setWave2Time] = useState('15:30');
  const [maxPlayers, setMaxPlayers] = useState(15);
  const [maxStandby, setMaxStandby] = useState(10);
  const [status, setStatus] = useState<GameStatus>('scheduled');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!gameDate || !kickoffTime || !deadlineDate || !deadlineTime) {
      toast.error('יש למלא את כל השדות הנדרשים');
      return;
    }

    setCreating(true);
    try {
      // Create proper timestamps
      const kickoffTimestamp = new Date(`${gameDate}T${kickoffTime}:00`);
      const deadlineTimestamp = new Date(`${deadlineDate}T${deadlineTime}:00`);
      const wave1Timestamp = wave1Date && wave1Time ? new Date(`${wave1Date}T${wave1Time}:00`) : null;
      const wave2Timestamp = wave2Date && wave2Time ? new Date(`${wave2Date}T${wave2Time}:00`) : null;

      const { error } = await supabase.from('games').insert({
        date: gameDate,
        kickoff_time: kickoffTimestamp.toISOString(),
        deadline_time: deadlineTimestamp.toISOString(),
        wave1_registration_opens_at: wave1Timestamp?.toISOString() || null,
        registration_opens_at: wave2Timestamp?.toISOString() || null,
        status,
        is_auto_generated: false,
        max_players: maxPlayers,
        max_standby: maxStandby,
      });

      if (error) throw error;

      toast.success('משחק הבדיקה נוצר בהצלחה!');
      onGameCreated();
      onClose();
    } catch (error: any) {
      toast.error('שגיאה ביצירת משחק', { description: error.message });
    } finally {
      setCreating(false);
    }
  };

  // Auto-fill dates when game date is selected
  const handleGameDateChange = (date: string) => {
    setGameDate(date);
    if (date) {
      // Auto-fill deadline to same day
      setDeadlineDate(date);
      
      // Auto-fill wave1 to Friday (day before if Saturday)
      const gameDay = new Date(date);
      const friday = new Date(gameDay);
      friday.setDate(friday.getDate() - 1);
      setWave1Date(friday.toISOString().split('T')[0]);
      setWave2Date(friday.toISOString().split('T')[0]);
    }
  };

  return (
    <Card className="glass border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              יצירת משחק בדיקה
            </CardTitle>
            <CardDescription>הגדר את כל הפרמטרים ידנית</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Game Date & Kickoff */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gameDate">תאריך משחק *</Label>
              <Input
                id="gameDate"
                type="date"
                value={gameDate}
                onChange={(e) => handleGameDateChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kickoffTime">שעת התחלה *</Label>
              <Input
                id="kickoffTime"
                type="time"
                value={kickoffTime}
                onChange={(e) => setKickoffTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="deadlineDate">תאריך דד-ליין *</Label>
              <Input
                id="deadlineDate"
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadlineTime">שעת דד-ליין *</Label>
              <Input
                id="deadlineTime"
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Wave 1 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wave1Date">Wave 1 - תאריך (תושבים)</Label>
              <Input
                id="wave1Date"
                type="date"
                value={wave1Date}
                onChange={(e) => setWave1Date(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wave1Time">Wave 1 - שעה</Label>
              <Input
                id="wave1Time"
                type="time"
                value={wave1Time}
                onChange={(e) => setWave1Time(e.target.value)}
              />
            </div>
          </div>

          {/* Wave 2 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wave2Date">Wave 2 - תאריך (כולם)</Label>
              <Input
                id="wave2Date"
                type="date"
                value={wave2Date}
                onChange={(e) => setWave2Date(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wave2Time">Wave 2 - שעה</Label>
              <Input
                id="wave2Time"
                type="time"
                value={wave2Time}
                onChange={(e) => setWave2Time(e.target.value)}
              />
            </div>
          </div>

          {/* Player Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="maxPlayers">מקסימום שחקנים</Label>
              <Input
                id="maxPlayers"
                type="number"
                min={1}
                max={50}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 15)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxStandby">מקסימום ממתינים</Label>
              <Input
                id="maxStandby"
                type="number"
                min={0}
                max={50}
                value={maxStandby}
                onChange={(e) => setMaxStandby(parseInt(e.target.value) || 10)}
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>סטטוס התחלתי</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as GameStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">מתוכנן</SelectItem>
                <SelectItem value="open_for_residents">פתוח לתושבים</SelectItem>
                <SelectItem value="open_for_all">פתוח לכולם</SelectItem>
                <SelectItem value="closed">סגור</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={creating}
            className="w-full gap-2"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                צור משחק לבדיקה
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
