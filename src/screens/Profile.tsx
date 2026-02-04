"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
import {
  initOneSignal,
  isPushSupported,
  optInPush,
  optOutPush,
  requestPushPermission,
} from '@/lib/onesignal';

interface PhoneValidation {
  isValid: boolean;
  error?: string;
}

const validatePhoneNumber = (phone: string): PhoneValidation => {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 0) {
    return { isValid: false };
  }

  if (!digits.startsWith('05')) {
    return { isValid: false, error: 'מספר הטלפון חייב להתחיל ב-05' };
  }

  if (digits.length !== 10) {
    return { isValid: false, error: 'מספר הטלפון חייב להכיל 10 ספרות' };
  }

  return { isValid: true };
};

const formatToInternational = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return `+972${digits.slice(1)}`;
};

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
  const [phoneInput, setPhoneInput] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [autoCompleting, setAutoCompleting] = useState(false);
  const [isResident, setIsResident] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(() => isPushSupported());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameTouchedRef = useRef(false);
  const phoneTouchedRef = useRef(false);
  const initialCompletionRef = useRef<boolean | null>(null);
  const autoPromptedRef = useRef(false);
  const previousUserPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || !user) return;

    if (!nameTouchedRef.current) {
      const metadataName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      setFullName(profile.full_name || metadataName || '');
    }

    if (!phoneTouchedRef.current && !user.phone) {
      const fallbackPhone = profile.phone_number ? formatToLocal(profile.phone_number) : '';
      setPhoneInput(fallbackPhone);
    }

    setIsResident(profile.is_resident || false);
    setPushEnabled(profile.push_enabled ?? true);

    if (initialCompletionRef.current === null) {
      initialCompletionRef.current = Boolean(user.phone) && Boolean(profile.full_name?.trim());
    }
  }, [profile, user]);

  useEffect(() => {
    const currentPhone = user?.phone ?? null;
    if (!currentPhone) {
      previousUserPhoneRef.current = currentPhone;
      return;
    }

    if (currentPhone !== previousUserPhoneRef.current) {
      previousUserPhoneRef.current = currentPhone;
      phoneTouchedRef.current = false;
      setPhoneInput(formatToLocal(currentPhone));
      setPendingPhone(null);
      setPhoneStep('phone');
      setOtp('');
    }
  }, [user?.phone]);

  useEffect(() => {
    setPushSupported(isPushSupported());
  }, []);

  useEffect(() => {
    if (!user || !profile) return;
    if (initialCompletionRef.current === null) return;
    if (autoPromptedRef.current) return;

    const isCompleteNow = Boolean(user.phone) && Boolean(profile.full_name?.trim());
    if (initialCompletionRef.current === false && isCompleteNow) {
      autoPromptedRef.current = true;
      setAutoCompleting(true);
      (async () => {
        await handleAutoPushPrompt();
        router.replace('/dashboard');
      })();
    }
  }, [user, profile, router]);

  const phoneValidation = useMemo(() => validatePhoneNumber(phoneInput), [phoneInput]);
  const showPhoneError = phoneInput.length > 0 && phoneValidation.error;

  const formattedPhone = phoneValidation.isValid ? formatToInternational(phoneInput) : '';
  const phoneMatchesAuth = Boolean(formattedPhone && formattedPhone === user?.phone);
  const hasPendingVerification = Boolean(pendingPhone);
  const needsVerification = Boolean(formattedPhone && formattedPhone !== user?.phone);

  const isFirstTimeSetup = !profile?.full_name;

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

    const updateData: Record<string, unknown> = {
      id: user.id,
      full_name: fullName.trim(),
      updated_at: new Date().toISOString(),
    };

    if (isFirstTimeSetup) {
      updateData.is_resident = isResident;
    }

    const { error } = await supabase.from('profiles').upsert(updateData);

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

  const sendPhoneOtp = async () => {
    if (!phoneValidation.isValid) return;
    if (!needsVerification) {
      toast.message('מספר הטלפון כבר מאומת');
      return;
    }

    setPhoneLoading(true);
    const targetPhone = formattedPhone;

    const { error } = await supabase.auth.updateUser({
      phone: targetPhone,
    });

    if (error) {
      toast.error('שגיאה בשליחת קוד האימות', {
        description: error.message,
      });
      setPhoneLoading(false);
      return;
    }

    toast.success('קוד אימות נשלח!', {
      description: 'בדוק את הודעות ה-SMS שלך',
    });
    setPendingPhone(targetPhone);
    setPhoneStep('otp');
    setOtp('');
    setPhoneLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!user) return;
    if (!pendingPhone) return;

    setOtpLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: otp,
      type: 'phone_change',
    });

    if (error) {
      toast.error('קוד אימות שגוי', {
        description: error.message,
      });
      setOtpLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ phone_number: pendingPhone })
      .eq('id', user.id);

    if (updateError) {
      toast.error('שגיאה בעדכון מספר הטלפון', {
        description: updateError.message,
      });
      setOtpLoading(false);
      return;
    }

    toast.success('מספר הטלפון אומת בהצלחה');
    await refreshProfile();
    setPendingPhone(null);
    setPhoneStep('phone');
    setOtp('');
    setOtpLoading(false);
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

  const handleAutoPushPrompt = async () => {
    if (!user) return;
    if (!pushSupported) return;

    try {
      await initOneSignal();
      const permission = await requestPushPermission();
      if (permission !== 'granted') return;

      await optInPush();
      const { error } = await supabase
        .from('profiles')
        .update({ push_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (!error) {
        setPushEnabled(true);
        await refreshProfile();
      }
    } catch {
      // Ignore OneSignal errors during auto prompt.
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen gradient-dark">
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
                  value={phoneInput}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    phoneTouchedRef.current = true;
                    setPhoneInput(nextValue);
                    if (pendingPhone) {
                      const nextDigits = nextValue.replace(/\D/g, '');
                      const pendingDigits = formatToLocal(pendingPhone).replace(/\D/g, '');
                      if (nextDigits !== pendingDigits) {
                        setPendingPhone(null);
                        setPhoneStep('phone');
                        setOtp('');
                      }
                    }
                  }}
                  className={`h-12 ${showPhoneError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  dir="ltr"
                />
                {showPhoneError && (
                  <p className="text-sm text-destructive text-right">{phoneValidation.error}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={needsVerification ? 'default' : 'secondary'}
                    className="h-10"
                    onClick={sendPhoneOtp}
                    disabled={!needsVerification || phoneLoading || otpLoading || autoCompleting}
                  >
                    {phoneLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'שלח קוד אימות'
                    )}
                  </Button>
                  {phoneMatchesAuth && !hasPendingVerification && (
                    <Badge variant="secondary">מאומת</Badge>
                  )}
                  {hasPendingVerification && (
                    <Badge variant="outline">ממתין לאימות</Badge>
                  )}
                </div>
                {hasPendingVerification && (
                  <p className="text-sm text-muted-foreground">ממתין לאימות מספר חדש: {formatToLocal(pendingPhone ?? '')}</p>
                )}
              </div>

              {phoneStep === 'otp' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">קוד אימות</Label>
                    <Input
                      id="otp"
                      type="text"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="text-center text-2xl tracking-widest h-14"
                      maxLength={6}
                      dir="ltr"
                      required
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full h-12 text-lg font-semibold neon-glow"
                    onClick={handleVerifyOtp}
                    disabled={otpLoading || otp.length !== 6 || autoCompleting}
                  >
                    {otpLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      'אמת קוד'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={sendPhoneOtp}
                    disabled={phoneLoading || otpLoading || autoCompleting}
                  >
                    שלח קוד חדש
                  </Button>
                </div>
              )}

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
                  disabled={!pushSupported || pushLoading || autoCompleting}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={loading || autoCompleting}
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
