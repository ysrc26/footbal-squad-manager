"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowRight, Bell, Camera, Loader2, LogOut, Phone, User, Home } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ensurePushOptIn, getPushSubscriptionStatus, isPushSupported, optOutPush } from '@/lib/onesignal';
import PushPromptModal from '@/components/PushPromptModal';

const PUSH_PROMPTED_KEY = 'pushPrompted';

const formatToLocal = (phone: string): string => {
  if (!phone) return '';
  if (phone.startsWith('+972')) {
    return `0${phone.slice(4)}`;
  }
  return phone;
};

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [fullName, setFullName] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(() => isPushSupported());
  const [showPushModal, setShowPushModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameTouchedRef = useRef(false);

  useEffect(() => {
    if (!profile || !user) return;

    if (!nameTouchedRef.current) {
      const metadataName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      setFullName(profile.full_name || metadataName || '');
    }

    setPushEnabled(profile.push_enabled ?? false);
  }, [profile, user]);

  useEffect(() => {
    setPushSupported(isPushSupported());
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) return () => {
      active = false;
    };
    if (!profile?.push_enabled) {
      setPushEnabled(false);
      return () => {
        active = false;
      };
    }
    if (!isPushSupported()) {
      setPushEnabled(false);
      return () => {
        active = false;
      };
    }

    getPushSubscriptionStatus()
      .then(({ optedIn, hasSubscription }) => {
        if (!active) return;
        setPushEnabled(optedIn && hasSubscription);
      })
      .catch(() => {
        if (!active) return;
        setPushEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id, profile?.push_enabled]);

  const phoneDisplay = formatToLocal(user?.phone ?? profile?.phone_number ?? '');

  const uploadAvatar = async (file: File) => {
    if (!user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('יש להעלות קובץ תמונה בלבד');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('גודל הקובץ מקסימלי הוא 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('תמונת הפרופיל עודכנה!');
      await refreshProfile();
    } catch (error: any) {
      toast.error('שגיאה בהעלאת התמונה', { description: error.message });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAvatar(file);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!fullName.trim()) {
      toast.error('יש להזין שם מלא');
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      toast.error('שגיאה בשמירת הפרופיל', {
        description: error.message,
      });
    } else {
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });

      if (authError) {
        toast.error('שגיאה בעדכון שם המשתמש', {
          description: authError.message,
        });
        setLoading(false);
        return;
      }

      toast.success('הפרופיל נשמר בהצלחה!');
      await refreshProfile();
    }
    setLoading(false);
  };

  const enablePush = async () => {
    if (!user) return;

    setPushLoading(true);
    try {
      const permission = await ensurePushOptIn();
      if (permission !== 'granted') {
        toast.error('נדרש אישור התראות בדפדפן כדי להפעיל פוש');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ push_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      setPushEnabled(true);
      await refreshProfile();
      toast.success('התראות פוש הופעלו');
    } catch (error: any) {
      toast.error('שגיאה בהפעלת התראות פוש', {
        description: error.message,
      });
      setPushEnabled(false);
    } finally {
      setPushLoading(false);
      setShowPushModal(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`${PUSH_PROMPTED_KEY}:${user.id}`, '1');
      }
    }
  };

  const disablePush = async () => {
    if (!user) return;

    setPushLoading(true);
    try {
      await optOutPush();

      setPushEnabled(false);
      toast.success('התראות פוש הושבתו');
    } catch (error: any) {
      toast.error('שגיאה בעדכון התראות פוש', {
        description: error.message,
      });
      setPushEnabled(false);
    } finally {
      setPushLoading(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`${PUSH_PROMPTED_KEY}:${user.id}`, '1');
      }
    }
  };

  const handlePushToggle = (enabled: boolean) => {
    if (enabled) {
      if (!pushSupported) {
        toast.message('התראות פוש אינן נתמכות במכשיר זה');
        setPushEnabled(false);
        return;
      }
      setPushEnabled(true);
      setShowPushModal(true);
      return;
    }

    disablePush();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen gradient-dark">
      <PushPromptModal
        open={showPushModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowPushModal(false);
            setPushEnabled(false);
            if (user && typeof window !== 'undefined') {
              window.localStorage.setItem(`${PUSH_PROMPTED_KEY}:${user.id}`, '1');
            }
          }
        }}
        onConfirm={enablePush}
        onCancel={() => {
          setShowPushModal(false);
          setPushEnabled(false);
          if (user && typeof window !== 'undefined') {
            window.localStorage.setItem(`${PUSH_PROMPTED_KEY}:${user.id}`, '1');
          }
        }}
        loading={pushLoading}
      />
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2 flex-1">פרופיל</h1>
          <Button
            variant="ghost"
            className="gap-2"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" />
            התנתק
          </Button>
        </div>
      </header>

      <main className="container px-4 py-6">
        <Card className="glass neon-border animate-fade-in">
          <CardHeader className="text-center">
            <div className="mx-auto relative">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="תמונת פרופיל"
                  className="w-24 h-24 rounded-full object-cover border-2 border-primary/50"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-12 h-12 text-primary" />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 gap-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Camera className="h-3 w-3" />
                )}
                {uploadingAvatar ? 'מעלה...' : 'שנה תמונה'}
              </Button>
            </div>
            <CardTitle className="mt-6">פרטי המשתמש</CardTitle>
            <CardDescription>עדכן את הפרטים שלך</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  שם מלא
                </Label>
                <Input
                  id="fullName"
                  placeholder="הזן את שמך המלא"
                  value={fullName}
                  onChange={(e) => {
                    nameTouchedRef.current = true;
                    setFullName(e.target.value);
                  }}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  מספר טלפון
                </Label>
                <Input
                  value={phoneDisplay}
                  placeholder="0501234567"
                  className="h-12 bg-muted"
                  dir="ltr"
                  disabled
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Home className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="text-base font-medium">תושב נחלים</span>
                    <p className="text-sm text-muted-foreground">
                      {profile?.is_resident ? 'כן' : 'לא'} - לשינוי פנה למנהל
                    </p>
                  </div>
                </div>
                <Badge variant={profile?.is_resident ? 'default' : 'secondary'}>
                  {profile?.is_resident ? 'תושב' : 'לא תושב'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-primary" />
                  <div>
                    <Label htmlFor="pushEnabled" className="text-base font-medium cursor-pointer">
                      התראות פוש
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      קבל עדכונים על פתיחת הרשמה ותזכורות למשחק
                    </p>
                  </div>
                </div>
                <Switch
                  id="pushEnabled"
                  checked={pushEnabled}
                  onCheckedChange={handlePushToggle}
                  disabled={!pushSupported || pushLoading}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'שמור שינויים'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
