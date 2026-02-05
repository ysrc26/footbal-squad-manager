"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, User, Settings, FileText, Home } from 'lucide-react';
import Link from 'next/link';
import { GameRegistration } from '@/components/game/GameRegistration';
import { supabase } from '@/integrations/supabase/client';
import {
  ensurePushOptIn,
  getPushSubscriptionStatus,
  isPushSupported,
  setOneSignalExternalUserId,
} from '@/lib/onesignal';
import PushPromptModal from '@/components/PushPromptModal';
import { toast } from 'sonner';
import BottomNav from '@/components/BottomNav';

const PENDING_PUSH_KEY = 'pendingPushPrompt';
const PUSH_PROMPTED_KEY = 'pushPrompted';

export default function Dashboard() {
  const { user, profile, isAdmin, signOut, refreshProfile } = useAuth();
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const promptCheckedRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    if (promptCheckedRef.current) return;
    promptCheckedRef.current = true;

    const userPromptKey = `${PUSH_PROMPTED_KEY}:${user.id}`;
    const pending = window.localStorage.getItem(PENDING_PUSH_KEY);
    const pushParam = searchParams.get('push');

    if (pending || pushParam === '1') {
      window.localStorage.removeItem(PENDING_PUSH_KEY);
      if (pushParam === '1') {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('push');
        router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
      }
      if (!isPushSupported()) {
        window.localStorage.setItem(userPromptKey, '1');
        toast.message('התראות פוש אינן נתמכות במכשיר זה');
        return;
      }
      requestAnimationFrame(() => setShowPushModal(true));
      return;
    }

    const evaluateDevicePrompt = async () => {
      if (!profile?.push_enabled) return;
      if (!isPushSupported()) return;

      const alreadyPrompted = window.localStorage.getItem(userPromptKey);
      if (alreadyPrompted) return;

      const { optedIn, hasSubscription } = await getPushSubscriptionStatus();
      const shouldPromptForDevice = !optedIn || !hasSubscription;
      if (!shouldPromptForDevice) return;

      requestAnimationFrame(() => setShowPushModal(true));
    };

    evaluateDevicePrompt();
  }, [user, profile?.push_enabled]);

  const handlePushConfirm = async () => {
    if (!user) return;
    setPushLoading(true);
    try {
      const permission = await ensurePushOptIn();
      if (permission !== 'granted') {
        toast.error('נדרש אישור התראות בדפדפן כדי להפעיל פוש');
        return;
      }

      await setOneSignalExternalUserId(user.id);

      const { error } = await supabase
        .from('profiles')
        .update({ push_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (!error) {
        await refreshProfile();
        toast.success('התראות פוש הופעלו');
      }
    } catch {
      toast.error('שגיאה בהפעלת התראות פוש');
    } finally {
      setPushLoading(false);
      setShowPushModal(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`${PUSH_PROMPTED_KEY}:${user.id}`, '1');
      }
    }
  };

  const handlePushCancel = () => {
    setShowPushModal(false);
    if (typeof window !== 'undefined') {
      if (user) {
        window.localStorage.setItem(`${PUSH_PROMPTED_KEY}:${user.id}`, '1');
      }
    }
  };

  return (
    <div className="min-h-screen gradient-dark pb-20">
      <PushPromptModal
        open={showPushModal}
        onOpenChange={(open) => {
          if (!open) {
            handlePushCancel();
            return;
          }
          setShowPushModal(true);
        }}
        onConfirm={handlePushConfirm}
        onCancel={handlePushCancel}
        loading={pushLoading}
      />
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16 px-4">
          <h1 className="text-xl font-bold neon-text">כדורגל נחלים</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Badge variant="outline" className="border-primary text-primary">
                מנהל
              </Badge>
            )}
            <Button variant="ghost" onClick={signOut} className="gap-2">
              <LogOut className="h-5 w-5" />
              התנתק
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6 space-y-6">
        {/* Welcome Card */}
        <Card className="glass neon-border animate-fade-in">
          <CardHeader>
        <CardTitle className="flex items-center gap-3">
              {profile?.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt="תמונת פרופיל"
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
              <div>
                <p className="text-lg">שלום,</p>
                <p className="text-2xl font-bold neon-text">
                  {profile?.full_name || 'משתמש חדש'}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile?.is_resident && (
              <Badge className="bg-primary/20 text-primary border border-primary">
                🏠 תושב נחלים
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Game Registration */}
        <GameRegistration />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/profile">
            <Card className="glass hover:neon-border transition-all cursor-pointer h-full">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <User className="h-8 w-8 text-primary mb-2" />
                <span className="font-medium">פרופיל</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/rules">
            <Card className="glass hover:neon-border transition-all cursor-pointer h-full">
              <CardContent className="flex flex-col items-center justify-center py-6">
                <FileText className="h-8 w-8 text-primary mb-2" />
                <span className="font-medium">חוקים</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <Link href="/admin">
            <Card className="glass border-primary/50 hover:neon-border transition-all cursor-pointer">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg">ניהול מערכת</p>
                  <p className="text-sm text-muted-foreground">
                    הגדרות, משתמשים, QR
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
