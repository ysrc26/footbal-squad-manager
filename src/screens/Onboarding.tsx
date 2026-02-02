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
import { initOneSignal } from "@/lib/onesignal";
import OneSignal from "react-onesignal";

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
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const phoneValidation = useMemo(() => validatePhoneNumber(phone), [phone]);

  useEffect(() => {
    // בדיקה: אם יש טלפון בפרופיל (הציבורי), דלג לדשבורד
    // זה מונע כניסה לאונבורדינג אם כבר יש נתונים
    if (user?.user_metadata?.phone_number) {
       // אופציונלי: אפשר להוסיף כאן בדיקה מול profile.phone_number אם רוצים להיות בטוחים ב-100%
    }
  }, [user, router]);

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!phoneValidation.isValid) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: formatToInternational(phone),
      });

      if (error) throw error;

      toast.success('קוד אימות נשלח לטלפון שלך');
      setStep('otp');
    } catch (error: any) {
      console.error(error);
      toast.error('שגיאה בשליחת הקוד: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
  
    setLoading(true);
    try {
      // 1. אימות מול Auth (זה השלב שעבד לך כבר)
      const { error } = await supabase.auth.verifyOtp({
        phone: formatToInternational(phone),
        token: otp,
        type: 'sms',
      });
  
      if (error) throw error;

      // 2. תיקון הלופ: כתיבה כפויה לטבלת הפרופילים הציבורית
      // בלי זה, AuthWrapper יחשוב שעדיין אין לך טלפון
      if (user?.id) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ phone_number: formatToInternational(phone) })
            .eq('id', user.id);
            
          if (profileError) {
              console.error("Failed to sync phone to profile:", profileError);
          }
      }
  
      toast.success('האימות עבר בהצלחה!');
      
      // 3. עדכון הזיכרון של האפליקציה כדי שתראה את הטלפון החדש מיד
      await refreshProfile();
  
      // 4. רישום להתראות (Piggyback) - זה המקום בו הבועה תקפוץ
      try {
        await initOneSignal();
        if (OneSignal.Notifications.isPushSupported()) {
            OneSignal.Notifications.requestPermission();
            
            const currentUser = (await supabase.auth.getUser()).data.user;
            if (currentUser?.id) {
                OneSignal.login(currentUser.id);
            }
        }
      } catch (pushError) {
        console.error("Push setup error:", pushError);
      }
  
      // 5. מעבר לדשבורד (עכשיו זה יעבוד כי טבלת הפרופילים מעודכנת)
      router.replace('/dashboard');

    } catch (error: any) {
      console.error(error);
      toast.error('קוד שגוי או פג תוקף');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-dark">
      <Card className="w-full max-w-md glass-card border-border/50">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">אימות מספר טלפון</CardTitle>
          <CardDescription className="text-gray-400">
            כדי להשתמש באפליקציה, עלינו לאמת את מספר הטלפון שלך
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
                  placeholder="050-0000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`text-right h-12 ${!phoneValidation.isValid && phone.length > 0 ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                  dir="ltr"
                />
                {!phoneValidation.isValid && phone.length > 0 && (
                  <p className="text-xs text-red-400">{phoneValidation.error}</p>
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