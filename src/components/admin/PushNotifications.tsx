"use client";

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Bell, Loader2 } from 'lucide-react';

type Audience = 'all' | 'game_active' | 'game_standby' | 'user';

export function PushNotifications() {
  const [audience, setAudience] = useState<Audience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [userIdsInput, setUserIdsInput] = useState('');
  const [gameId, setGameId] = useState('');
  const [sending, setSending] = useState(false);

  const parseUserIds = () =>
    userIdsInput
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter(Boolean);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim() || !body.trim()) {
      toast.error('כותרת ותוכן נדרשים');
      return;
    }

    if (audience === 'user' && parseUserIds().length === 0) {
      toast.error('יש להזין לפחות מזהה משתמש אחד');
      return;
    }

    if ((audience === 'game_active' || audience === 'game_standby') && !gameId.trim()) {
      toast.error('יש להזין מזהה משחק');
      return;
    }

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        event_type: 'manual',
        audience,
        title: title.trim(),
        body: body.trim(),
      };

      if (url.trim()) {
        payload.url = url.trim();
      }

      if (audience === 'user') {
        payload.user_ids = parseUserIds();
      }

      if (audience === 'game_active' || audience === 'game_standby') {
        payload.game_id = gameId.trim();
      }

      const { data, error } = await supabase.functions.invoke('send-push', {
        body: payload,
      });

      if (error) {
        throw error;
      }

      if (data?.skipped) {
        toast.message('השליחה דולגה', {
          description: data.reason || 'אין נמענים זמינים',
        });
        return;
      }

      toast.success('ההתראה נשלחה');
      setTitle('');
      setBody('');
      setUrl('');
      setUserIdsInput('');
      setGameId('');
    } catch (error: any) {
      toast.error('שגיאה בשליחת ההתראה', {
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          שליחת התראות פוש
        </CardTitle>
        <CardDescription>
          שליחה ידנית של התראות לכל המשתמשים או לקבוצות ספציפיות
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>קהל יעד</Label>
            <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
              <SelectTrigger>
                <SelectValue placeholder="בחר קהל יעד" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המשתמשים</SelectItem>
                <SelectItem value="game_active">משחק - רשומים פעילים</SelectItem>
                <SelectItem value="game_standby">משחק - רשימת המתנה</SelectItem>
                <SelectItem value="user">משתמש ספציפי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audience === 'user' && (
            <div className="space-y-2">
              <Label htmlFor="userIds">מזהי משתמשים (UUID)</Label>
              <Input
                id="userIds"
                placeholder="uuid1, uuid2"
                value={userIdsInput}
                onChange={(event) => setUserIdsInput(event.target.value)}
                dir="ltr"
              />
            </div>
          )}

          {(audience === 'game_active' || audience === 'game_standby') && (
            <div className="space-y-2">
              <Label htmlFor="gameId">מזהה משחק (UUID)</Label>
              <Input
                id="gameId"
                placeholder="game uuid"
                value={gameId}
                onChange={(event) => setGameId(event.target.value)}
                dir="ltr"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">כותרת</Label>
            <Input
              id="title"
              placeholder="כותרת ההתראה"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">תוכן</Label>
            <Textarea
              id="body"
              placeholder="כתוב כאן את תוכן ההתראה"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">קישור (אופציונלי)</Label>
            <Input
              id="url"
              placeholder="/game"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'שלח התראה'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
