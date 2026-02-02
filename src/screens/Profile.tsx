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
import { Loader2, ArrowRight, User, Phone, Home, Camera, Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { initOneSignal, isPushSupported, optInPush, optOutPush, requestPushPermission } from '@/lib/onesignal';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isResident, setIsResident] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setIsResident(profile.is_resident || false);
      setPushEnabled(profile.push_enabled ?? true);
    }
  }, [profile]);

  useEffect(() => {
    setPushSupported(isPushSupported());
  }, []);

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

  const handlePushToggle = async (enabled: boolean) => {
    if (!user) return;

    setPushLoading(true);
    try {
      await initOneSignal();

      if (enabled) {
        const permission = await requestPushPermission();
        if (permission !== 'granted') {
          toast.error('נדרש אישור התראות בדפדפן כדי להפעיל פוש');
          setPushEnabled(false);
          return;
        }

        await optInPush();
      } else {
        await optOutPush();
      }

      const { error } = await supabase
        .from('profiles')
        .update({ push_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      setPushEnabled(enabled);
      await refreshProfile();
      toast.success(enabled ? 'התראות פוש הופעלו' : 'התראות פוש הושבתו');
    } catch (error: any) {
      toast.error('שגיאה בעדכון התראות פוש', {
        description: error.message,
      });
      setPushEnabled(profile?.push_enabled ?? true);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="container flex items-center h-16 px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold mr-2">פרופיל</h1>
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
