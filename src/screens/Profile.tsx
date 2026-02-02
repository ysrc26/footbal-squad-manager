"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, ArrowRight, User, Phone, Home, Camera } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import OneSignal from 'react-onesignal';
import { initOneSignal } from '@/lib/onesignal';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isResident, setIsResident] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setIsResident(profile.is_resident || false);
    }
  }, [profile]);

  // Check if this is first time setup (no name set yet)
  const isFirstTimeSetup = !profile?.full_name;

  const uploadAvatar = async (file: File) => {
    if (!user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('יש להעלות קובץ תמונה בלבד');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('גודל הקובץ מקסימלי הוא 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAvatar(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    
    // Only include is_resident on first time setup
    const updateData: Record<string, unknown> = {
      id: user.id,
      full_name: fullName,
      phone_number: user.phone || null,
      updated_at: new Date().toISOString(),
    };
    
    // Only set is_resident on first time setup
    if (isFirstTimeSetup) {
      updateData.is_resident = isResident;
    }
    
    const { error } = await supabase
      .from('profiles')
      .upsert(updateData);
    
    if (error) {
      toast.error('שגיאה בשמירת הפרופיל', {
        description: error.message,
      });
    } else {
      toast.success('הפרופיל נשמר בהצלחה!');
      await refreshProfile();
    }
    setLoading(false);
  };

  const waitForOneSignalReady = async () => {
    try {
      await initOneSignal();
      return Boolean(OneSignal?.Notifications && OneSignal?.User?.PushSubscription);
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const handleEnableNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const ready = await waitForOneSignalReady();
      if (!ready) {
        toast.error('מערכת ההתראות עדיין נטענת, נסה שוב בעוד רגע');
        return;
      }

      if (!OneSignal.Notifications.isPushSupported()) {
        toast.error('הדפדפן/המכשיר לא תומך בהתראות');
        return;
      }

      const permission = await OneSignal.Notifications.requestPermission();
      if (permission !== 'granted') {
        toast.error('ההרשאה נדחתה. אפשר להפעיל בהגדרות הדפדפן');
        return;
      }
      if (user?.id) {
        await OneSignal.login(user.id);
      }
      let enabled = false;
      for (let i = 0; i < 10; i += 1) {
        const subscriptionId = OneSignal.User.PushSubscription?.id;
        if (subscriptionId) {
          enabled = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      setNotificationsEnabled(enabled);
      if (enabled) {
        toast.success('ההתראות הופעלו בהצלחה');
      } else {
        toast.error('לא הצלחנו לרשום אותך להתראות, נסה שוב בעוד רגע');
      }
    } catch (error) {
      console.error(error);
      toast.error('שגיאה בהפעלת התראות');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const ready = await waitForOneSignalReady();
      if (!ready) {
        toast.error('מערכת ההתראות עדיין נטענת, נסה שוב בעוד רגע');
        return;
      }

      if (typeof OneSignal.User?.PushSubscription?.optOut === 'function') {
        await OneSignal.User.PushSubscription.optOut();
      } else if (typeof (OneSignal.User?.PushSubscription as { setOptedOut?: (value: boolean) => Promise<void> })?.setOptedOut === 'function') {
        await (OneSignal.User?.PushSubscription as { setOptedOut?: (value: boolean) => Promise<void> }).setOptedOut?.(true);
      }

      if (typeof OneSignal.logout === 'function') {
        await OneSignal.logout();
      }

      if (user?.id) {
        await supabase.from('profiles').update({ onesignal_id: null }).eq('id', user.id);
      }

      setNotificationsEnabled(false);
      toast.success('ההתראות כובו בהצלחה');
    } catch (error) {
      console.error(error);
      toast.error('שגיאה בכיבוי התראות');
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const syncNotificationsState = async () => {
      const ready = await waitForOneSignalReady();
      if (!ready || !active) return;
      const subscriptionId = OneSignal.User.PushSubscription?.id;
      setNotificationsEnabled(Boolean(subscriptionId));
    };

    syncNotificationsState();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen gradient-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2">הגדרות</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">
        <Card className="glass neon-border animate-fade-in">
          <CardHeader className="text-center">
            {/* Avatar Section */}
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
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  מספר טלפון
                </Label>
                <Input
                  value={user?.phone || ''}
                  disabled
                  className="h-12 bg-muted"
                  dir="ltr"
                />
              </div>

              {isFirstTimeSetup ? (
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-primary" />
                    <div>
                      <Label htmlFor="isResident" className="text-base font-medium cursor-pointer">
                        תושב נחלים
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        תושבים מקבלים עדיפות בהרשמה
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="isResident"
                    checked={isResident}
                    onCheckedChange={setIsResident}
                  />
                </div>
              ) : (
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
              )}

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

        <Card className="mt-6 border border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle>הגדרות התראות</CardTitle>
            <CardDescription>נהל את הרשאות ההתראות שלך</CardDescription>
          </CardHeader>
          <CardContent>
            {notificationsEnabled ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full h-12 text-lg font-semibold"
                onClick={handleDisableNotifications}
                disabled={notificationsLoading}
              >
                {notificationsLoading ? 'מכבה...' : 'כבה התראות'}
              </Button>
            ) : (
              <Button
                type="button"
                className="w-full h-12 text-lg font-semibold neon-glow"
                onClick={handleEnableNotifications}
                disabled={notificationsLoading}
              >
                {notificationsLoading ? 'מפעיל...' : 'הפעלת התראות'}
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
