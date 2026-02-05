"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Bell, Loader2, X } from 'lucide-react';

type Audience = 'all' | 'game_registered' | 'user';

type UserOption = {
  id: string;
  full_name: string | null;
};

export function PushNotifications() {
  const [audience, setAudience] = useState<Audience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [gameId, setGameId] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (audience !== 'user') return;
    let active = true;
    const loadUsers = async () => {
      setLoadingUsers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      if (!active) return;
      if (error) {
        toast.error('שגיאה בטעינת משתמשים', { description: error.message });
        setAvailableUsers([]);
      } else {
        setAvailableUsers((data as UserOption[]) ?? []);
      }
      setLoadingUsers(false);
    };
    loadUsers();
    return () => {
      active = false;
    };
  }, [audience]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return availableUsers;
    return availableUsers.filter((user) =>
      (user.full_name ?? '').toLowerCase().includes(query)
    );
  }, [availableUsers, userSearch]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const clearSelectedUser = (userId: string) => {
    setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim() || !body.trim()) {
      toast.error('כותרת ותוכן נדרשים');
      return;
    }

    if (audience === 'user' && selectedUserIds.length === 0) {
      toast.error('יש לבחור לפחות משתמש אחד');
      return;
    }

    if (audience === 'game_registered' && !gameId.trim()) {
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
        payload.user_ids = selectedUserIds;
      }

      if (audience === 'game_registered') {
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
      setUserSearch('');
      setSelectedUserIds([]);
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
                <SelectItem value="game_registered">משחק - כל הרשומים</SelectItem>
                <SelectItem value="user">משתמש ספציפי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audience === 'user' && (
            <div className="space-y-3">
              <Label htmlFor="userSearch">בחירת משתמשים</Label>
              <Input
                id="userSearch"
                placeholder="חפש לפי שם"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
              {selectedUserIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUserIds.map((id) => {
                    const user = availableUsers.find((item) => item.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1">
                        {user?.full_name || id}
                        <button
                          type="button"
                          onClick={() => clearSelectedUser(id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Remove user"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
                {loadingUsers ? (
                  <div className="p-4 text-sm text-muted-foreground">טוען משתמשים...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">לא נמצאו משתמשים</div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {filteredUsers.map((user) => {
                      const isSelected = selectedUserIds.includes(user.id);
                      return (
                        <li key={user.id}>
                          <label className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {user.full_name || 'ללא שם'}
                              </span>
                              <span className="text-xs text-muted-foreground">{user.id}</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleUserSelection(user.id)}
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {audience === 'game_registered' && (
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
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שלח התראה'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
