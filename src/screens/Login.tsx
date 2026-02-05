"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Chrome, Loader2, Mail, Phone, Shield } from 'lucide-react';

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

export default function Login() {
  const [loadingAction, setLoadingAction] = useState<
    null | 'google' | 'phone' | 'otp' | 'email'
  >(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const phoneValidation = useMemo(() => validatePhoneNumber(phone), [phone]);
  const showPhoneError = phone.length > 0 && phoneValidation.error;

  const handleGoogleSignIn = async () => {
    setLoadingAction('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      toast.error('שגיאה בהתחברות עם Google', {
        description: error.message,
      });
      setLoadingAction(null);
    }
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!phoneValidation.isValid) return;

    setLoadingAction('phone');
    const formattedPhone = formatToInternational(phone);

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        channel: 'sms',
      },
    });

    if (error) {
      toast.error('שגיאה בשליחת קוד האימות', {
        description: error.message,
      });
      setLoadingAction(null);
      return;
    }

    toast.success('קוד אימות נשלח!', {
      description: 'בדוק את הודעות ה-SMS שלך',
    });
    setPhoneStep('otp');
    setOtp('');
    setLoadingAction(null);
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;

    setLoadingAction('otp');
    const formattedPhone = formatToInternational(phone);

    const { error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otp,
      type: 'sms',
    });

    if (error) {
      toast.error('קוד אימות שגוי', {
        description: error.message,
      });
      setLoadingAction(null);
      return;
    }

    toast.success('התחברת בהצלחה!');
    setLoadingAction(null);
  };

  const handleSendMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoadingAction('email');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      toast.error('שגיאה בשליחת הקישור', {
        description: error.message,
      });
      setLoadingAction(null);
      return;
    }

    setEmailSent(true);
    toast.success('נשלח קישור התחברות למייל');
    setLoadingAction(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-dark" dir="rtl">
      <Card className="w-full max-w-md glass neon-border animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center neon-glow">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold neon-text">ברוכים הבאים</CardTitle>
          <CardDescription className="text-muted-foreground">
            התחבר באמצעות Google, טלפון או אימייל
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="google" className="w-full">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="google">Google</TabsTrigger>
              <TabsTrigger value="phone">טלפון</TabsTrigger>
              <TabsTrigger value="email">אימייל</TabsTrigger>
            </TabsList>

            <TabsContent value="google" className="pt-4">
              <Button
                type="button"
                className="w-full h-12 text-lg font-semibold neon-glow"
                onClick={handleGoogleSignIn}
                disabled={loadingAction !== null}
              >
                {loadingAction === 'google' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Chrome className="h-5 w-5 ml-2" />
                    התחברות עם Google
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="phone" className="pt-4">
              {phoneStep === 'phone' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      מספר טלפון
                    </label>
                    <Input
                      type="tel"
                      placeholder="0501234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`text-lg h-12 ${showPhoneError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      dir="ltr"
                      required
                    />
                    {showPhoneError && (
                      <p className="text-sm text-destructive text-right">{phoneValidation.error}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 text-lg font-semibold neon-glow"
                    disabled={loadingAction !== null || !phoneValidation.isValid}
                  >
                    {loadingAction === 'phone' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      'שלח קוד אימות'
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">קוד אימות</label>
                    <Input
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
                    disabled={loadingAction !== null || otp.length !== 6}
                  >
                    {loadingAction === 'otp' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      'אמת קוד'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setPhoneStep('phone')}
                    disabled={loadingAction !== null}
                  >
                    שלח קוד חדש
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="email" className="pt-4">
              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    כתובת אימייל
                  </label>
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailSent(false);
                    }}
                    className="h-12"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-semibold neon-glow"
                  disabled={loadingAction !== null || !email}
                >
                  {loadingAction === 'email' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'שלח קישור התחברות'
                  )}
                </Button>
                {emailSent && (
                  <p className="text-sm text-center text-muted-foreground">
                    שלחנו לך קישור התחברות למייל
                  </p>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
