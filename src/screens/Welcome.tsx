"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowRight, Loader2, LogOut, Phone, User, Home } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface PhoneValidation {
  isValid: boolean;
  error?: string;
}

const normalizeToLocalDigits = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  return digits;
};

const validatePhoneNumber = (phone: string): PhoneValidation => {
  const digits = normalizeToLocalDigits(phone);

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
  const digits = normalizeToLocalDigits(phone);
  if (!digits.startsWith('0')) return `+${digits}`;
  return `+972${digits.slice(1)}`;
};

const formatToLocal = (phone: string): string => {
  if (!phone) return '';
  if (phone.startsWith('+972')) {
    return `0${phone.slice(4)}`;
  }
  return phone;
};

const PENDING_PUSH_KEY = 'pendingPushPrompt';

export default function Welcome() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [isResident, setIsResident] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const nameTouchedRef = useRef(false);

  useEffect(() => {
    if (!profile || !user) return;

    if (!nameTouchedRef.current) {
      const metadataName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
      setFullName(profile.full_name || metadataName || '');
    }

    const authPhone = user.phone ?? '';
    const profilePhone = profile.phone_number ?? '';
    const displayPhone = authPhone || profilePhone;
    setPhoneInput(formatToLocal(displayPhone));

    setIsResident(profile.is_resident || false);
  }, [profile, user]);

  const phoneValidation = useMemo(() => validatePhoneNumber(phoneInput), [phoneInput]);
  const showPhoneError = !user?.phone && phoneInput.length > 0 && phoneValidation.error;

  const formattedPhone = phoneValidation.isValid ? formatToInternational(phoneInput) : '';
  const phoneVerified = Boolean(user?.phone);
  const canSendOtp = !phoneVerified && phoneValidation.isValid && !sendingOtp && !verifyingOtp;
  const canVerifyOtp = Boolean(!phoneVerified && pendingPhone && otp.length === 6);
  const canSave = Boolean(fullName.trim() && phoneVerified && !saving && !sendingOtp && !verifyingOtp);

  const sendPhoneOtp = async () => {
    if (!phoneValidation.isValid || phoneVerified) return;

    setSendingOtp(true);
    const targetPhone = formattedPhone;

    const { error } = await supabase.auth.updateUser({
      phone: targetPhone,
    });

    if (error) {
      toast.error('שגיאה בשליחת קוד האימות', {
        description: error.message,
      });
      setSendingOtp(false);
      return;
    }

    toast.success('קוד אימות נשלח!', {
      description: 'בדוק את הודעות ה-SMS שלך',
    });
    setPendingPhone(targetPhone);
    setPhoneStep('otp');
    setOtp('');
    setSendingOtp(false);
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!pendingPhone || phoneVerified) return;

    setVerifyingOtp(true);

    const { error } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: otp,
      type: 'phone_change',
    });

    if (error) {
      toast.error('קוד אימות שגוי', {
        description: error.message,
      });
      setVerifyingOtp(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ phone_number: pendingPhone, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      toast.error('שגיאה בעדכון מספר הטלפון', {
        description: updateError.message,
      });
      setVerifyingOtp(false);
      return;
    }

    toast.success('מספר הטלפון אומת בהצלחה');
    await refreshProfile();
    setPendingPhone(null);
    setPhoneStep('phone');
    setOtp('');
    setVerifyingOtp(false);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!fullName.trim()) {
      toast.error('יש להזין שם מלא');
      return;
    }

    if (!user.phone) {
      toast.error('יש לאמת מספר טלפון לפני שמירה');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone_number: user.phone,
        is_resident: isResident,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      toast.error('שגיאה בשמירת הפרופיל', {
        description: error.message,
      });
      setSaving(false);
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });

    if (authError) {
      toast.error('שגיאה בעדכון שם המשתמש', {
        description: authError.message,
      });
      setSaving(false);
      return;
    }

    await refreshProfile();
    localStorage.setItem(PENDING_PUSH_KEY, '1');
    router.replace('/dashboard?push=1');
    setSaving(false);
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
          <h1 className="text-xl font-bold mr-2 flex-1">השלמת פרטים</h1>
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
            <CardTitle className="text-2xl font-bold">ברוך הבא!</CardTitle>
            <CardDescription>
              יש להשלים את הפרטים הבאים: שם מלא, מספר טלפון, והאם אתה תושב נחלים.
            </CardDescription>
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
                <p className="text-xs text-muted-foreground">שדה חובה *</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  מספר טלפון
                </Label>
                <Input
                  value={phoneInput}
                  placeholder="0501234567"
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setPhoneInput(nextValue);
                    if (pendingPhone) {
                      const nextDigits = normalizeToLocalDigits(nextValue);
                      const pendingDigits = normalizeToLocalDigits(formatToLocal(pendingPhone));
                      if (nextDigits !== pendingDigits) {
                        setPendingPhone(null);
                        setPhoneStep('phone');
                        setOtp('');
                      }
                    }
                  }}
                  className={`h-12 ${showPhoneError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  dir="ltr"
                  required
                  disabled={phoneVerified}
                />
                {showPhoneError && (
                  <p className="text-sm text-destructive text-right">{phoneValidation.error}</p>
                )}
                <p className="text-xs text-muted-foreground">שדה חובה *</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={canSendOtp ? 'default' : 'secondary'}
                    className="h-10"
                    onClick={sendPhoneOtp}
                    disabled={!canSendOtp}
                  >
                    {sendingOtp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'שלח קוד אימות'
                    )}
                  </Button>
                  {phoneVerified && (
                    <Badge variant="secondary">מאומת</Badge>
                  )}
                  {!phoneVerified && pendingPhone && (
                    <Badge variant="outline">ממתין לאימות</Badge>
                  )}
                </div>
                {!phoneVerified && pendingPhone && (
                  <p className="text-sm text-muted-foreground">
                    ממתין לאימות מספר: {formatToLocal(pendingPhone)}
                  </p>
                )}
              </div>

              {!phoneVerified && phoneStep === 'otp' && (
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
                    disabled={!canVerifyOtp || verifyingOtp}
                  >
                    {verifyingOtp ? (
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
                    disabled={!canSendOtp}
                  >
                    שלח קוד חדש
                  </Button>
                </div>
              )}

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

              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={!canSave}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'שמור והמשך'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
