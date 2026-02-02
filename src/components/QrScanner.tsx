"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, QrCode, MapPin, CheckCircle2, XCircle, Camera } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { isWithinRadius, calculateDistance } from '@/lib/geolocation';

interface QrScannerProps {
  gameId?: string;
  onCheckInSuccess?: () => void;
}

interface AppSettings {
  field_latitude: number | null;
  field_longitude: number | null;
  qr_secret_key: string;
}

type ScanStatus = 'idle' | 'requesting_location' | 'scanning' | 'verifying' | 'success' | 'error';

export function QrScanner({ gameId, onCheckInSuccess }: QrScannerProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppSettings();
  }, []);

  const fetchAppSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('field_latitude, field_longitude, qr_secret_key')
        .maybeSingle();

      if (error) throw error;
      setAppSettings(data);
    } catch (error) {
      console.error('Error fetching app settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (result: string) => {
    if (status !== 'scanning' || !appSettings || !user) return;

    setStatus('verifying');

    try {
      // Step 1: Verify QR code matches the secret key
      if (result !== appSettings.qr_secret_key) {
        throw new Error('קוד QR לא תקין');
      }

      // Step 2: Get user's current location
      const position = await getCurrentPosition();
      
      // Step 3: Verify user is within 10 meters of the field
      if (!appSettings.field_latitude || !appSettings.field_longitude) {
        throw new Error('מיקום המגרש לא מוגדר במערכת');
      }

      const distance = calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        appSettings.field_latitude,
        appSettings.field_longitude
      );

      if (!isWithinRadius(
        position.coords.latitude,
        position.coords.longitude,
        appSettings.field_latitude,
        appSettings.field_longitude,
        10 // 10 meters radius
      )) {
        throw new Error(`אתה רחוק מהמגרש (${Math.round(distance)} מטר). יש להתקרב לרדיוס 10 מטר`);
      }

      // Step 4: Update check-in status if gameId is provided
      if (gameId) {
        const { error: updateError } = await supabase
          .from('registrations')
          .update({
            check_in_status: 'checked_in',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('game_id', gameId);

        if (updateError) throw updateError;
      }

      setStatus('success');
      toast.success('צ\'ק-אין בוצע בהצלחה! 🎉');
      
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
        onCheckInSuccess?.();
      }, 2000);

    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message || 'שגיאה בביצוע צ\'ק-אין');
    }
  };

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('הדפדפן לא תומך במיקום GPS'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(new Error('יש לאשר גישה למיקום'));
              break;
            case error.POSITION_UNAVAILABLE:
              reject(new Error('מיקום לא זמין'));
              break;
            case error.TIMEOUT:
              reject(new Error('זמן קבלת מיקום פג'));
              break;
            default:
              reject(new Error('שגיאה בקבלת מיקום'));
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const openScanner = async () => {
    setErrorMessage('');
    
    // Check if browser supports geolocation
    if (!navigator.geolocation) {
      toast.error('הדפדפן לא תומך במיקום GPS');
      return;
    }

    setStatus('requesting_location');

    // Request location permission BEFORE opening the scanner
    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      
      // Permission granted - open scanner
      setStatus('scanning');
      setIsOpen(true);
    } catch (error: any) {
      setStatus('idle');
      // Permission denied or other error
      if (error.code === 1) { // PERMISSION_DENIED
        toast.error('יש לאשר גישה למיקום כדי לבצע צ\'ק-אין', {
          description: 'לחץ על סמל הנעילה בשורת הכתובת ואפשר גישה למיקום',
          duration: 5000,
        });
      } else if (error.code === 2) { // POSITION_UNAVAILABLE
        toast.error('מיקום לא זמין', {
          description: 'בדוק שהמיקום מופעל במכשיר',
        });
      } else if (error.code === 3) { // TIMEOUT
        toast.error('זמן קבלת מיקום פג', {
          description: 'נסה שוב',
        });
      } else {
        toast.error('לא ניתן לקבל מיקום', {
          description: 'נסה שוב או בדוק שהמיקום מופעל במכשיר',
        });
      }
    }
  };

  const closeScanner = () => {
    setIsOpen(false);
    setStatus('idle');
    setErrorMessage('');
  };

  const retryScanning = () => {
    setStatus('scanning');
    setErrorMessage('');
  };

  if (loading) {
    return null;
  }

  return (
    <>
      {/* Scan Button */}
      <Button
        onClick={openScanner}
        className="w-full h-14 text-lg font-semibold neon-glow gap-3"
        disabled={!appSettings?.qr_secret_key || status === 'requesting_location'}
      >
        {status === 'requesting_location' ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" />
            מבקש הרשאת מיקום...
          </>
        ) : (
          <>
            <QrCode className="h-6 w-6" />
            סרוק QR לצ&apos;ק-אין
          </>
        )}
      </Button>

      {/* Scanner Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md glass border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-center">
              <QrCode className="h-5 w-5 text-primary" />
              סריקת QR לצ&apos;ק-אין
            </DialogTitle>
            <DialogDescription className="text-center">
              כוון את המצלמה לקוד ה-QR במגרש
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {status === 'scanning' && (
              <div className="relative rounded-lg overflow-hidden aspect-square bg-black">
                <Scanner
                  onScan={(result) => {
                    if (result && result[0]?.rawValue) {
                      handleScan(result[0].rawValue);
                    }
                  }}
                  onError={(error) => {
                    console.error('Scanner error:', error);
                  }}
                  styles={{
                    container: { width: '100%', height: '100%' },
                    video: { width: '100%', height: '100%', objectFit: 'cover' },
                  }}
                />
                <div className="absolute inset-0 border-4 border-primary/50 rounded-lg pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-primary rounded-lg" />
                </div>
              </div>
            )}

            {status === 'verifying' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">מאמת נתונים...</p>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 mt-2">
                    <MapPin className="h-4 w-4" />
                    בודק מיקום GPS
                  </p>
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-xl text-green-500">צ&apos;ק-אין בוצע!</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    הנוכחות שלך נרשמה בהצלחה
                  </p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
                  <XCircle className="h-12 w-12 text-destructive" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-xl text-destructive">שגיאה</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {errorMessage}
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={closeScanner}
                  >
                    סגור
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={retryScanning}
                  >
                    <Camera className="h-4 w-4 ml-2" />
                    נסה שוב
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
