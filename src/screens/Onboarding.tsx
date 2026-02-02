"use client";

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import OneSignal from 'react-onesignal';

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
  return '+972' + digits.slice(1);
};

export default function Onboarding() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (profile?.phone_number) {
      router.replace('/');
    }
  }, [authLoading, user, profile?.phone_number, router]);

  const phoneValidation = useMemo(() => validatePhoneNumber(phone), [phone]);
  const showPhoneError = phone.length > 0 && phoneValidation.error;

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!phoneValidation.isValid) return;

    setLoading(true);
    const formattedPhone = formatToInternational(phone);
    const { error } = await supabase.auth.updateUser({
      phone: formattedPhone,
    });

    if (error) {
      console.error('updateUser error:', {
        message: error.message,
        name: (error as any).name,
        status: (error as any).status,
        code: (error as any).code,
      });
      toast.error('שגיאה בשליחת קוד האימות', {
        description: `${error.message}${(error as any).code ? ` (${(error as any).code})` : ''}`,
      });
      setLoading(false);
      return;
    }

    toast.success('קוד אימות נשלח!', {
      description: 'בדוק את הודעות ה-SMS שלך',
    });
    setStep('otp');
    setLoading(false);
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const formattedPhone = formatToInternational(phone);
    const { error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otp,
      type: 'phone_change',
    });

    if (error) {
      console.error('verifyOtp error:', {
        message: error.message,
        name: (error as any).name,
        status: (error as any).status,
        code: (error as any).code,
      });
      toast.error('קוד אימות שגוי', {
        description: `${error.message}${(error as any).code ? ` (${(error as any).code})` : ''}`,
      });
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ phone_number: formattedPhone })
      .eq('id', user.id);

    if (updateError) {
      console.error('profiles update error:', {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      });
      toast.error('שגיאה בעדכון מספר הטלפון', {
        description: `${updateError.message}${updateError.code ? ` (${updateError.code})` : ''}`,
      });
      setLoading(false);
      return;
    }

    try {
      if (OneSignal.Notifications.isPushSupported()) {
        OneSignal.Notifications.requestPermission();
        if (user?.id) {
          OneSignal.login(user.id);
        }
      }
    } catch (error) {
      console.error(error);
    }

    await refreshProfile();
    toast.success('מספר הטלפון אומת בהצלחה');
    router.replace('/');
    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-dark" dir="rtl">
      <Card className="w-full max-w-md glass neon-border animate-fade-in">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center neon-glow">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold neon-text">אימות טלפון</CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === 'phone'
              ? 'כדי להמשיך, נא להזין מספר טלפון ישראלי'
              : 'הזן את קוד האימות שנשלח אליך'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">מספר טלפון</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0501234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`text-lg h-12 ${showPhoneError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  dir="ltr"
                  required
                />
                {showPhoneError && (
                  <p className="text-sm text-destructive text-right">
                    {phoneValidation.error}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={loading || !phoneValidation.isValid}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'שלח קוד אימות'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
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
                type="submit"
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={loading || otp.length !== 6}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'אמת קוד'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep('phone')}
                disabled={loading}
              >
                שלח קוד חדש
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
