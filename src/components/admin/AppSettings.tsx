"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, MapPin, Key, RefreshCw, Navigation, Copy, Eye, EyeOff } from 'lucide-react';

interface AppSettingsData {
  id: string;
  field_latitude: number | null;
  field_longitude: number | null;
  qr_secret_key: string;
}

export function AppSettings() {
  const [settings, setSettings] = useState<AppSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showQrKey, setShowQrKey] = useState(false);
  
  // Form state
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [qrSecretKey, setQrSecretKey] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('id, field_latitude, field_longitude, qr_secret_key')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setLatitude(data.field_latitude?.toString() || '');
        setLongitude(data.field_longitude?.toString() || '');
        setQrSecretKey(data.qr_secret_key || '');
      }
    } catch (error: any) {
      toast.error('שגיאה בטעינת ההגדרות', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('הדפדפן לא תומך במיקום GPS');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        toast.success('מיקום נקלט בהצלחה!');
        setGettingLocation(false);
      },
      (error) => {
        toast.error('שגיאה בקבלת מיקום', {
          description: error.message,
        });
        setGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const generateQrKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let key = '';
    for (let i = 0; i < 64; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setQrSecretKey(key);
    toast.success('מפתח QR חדש נוצר');
  };

  const copyQrKey = async () => {
    try {
      await navigator.clipboard.writeText(qrSecretKey);
      toast.success('המפתח הועתק ללוח');
    } catch {
      toast.error('שגיאה בהעתקה');
    }
  };

  const handleSave = async () => {
    if (!latitude || !longitude) {
      toast.error('יש להזין קואורדינטות GPS');
      return;
    }

    if (qrSecretKey.length < 60) {
      toast.error('מפתח QR חייב להכיל לפחות 60 תווים');
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        field_latitude: parseFloat(latitude),
        field_longitude: parseFloat(longitude),
        qr_secret_key: qrSecretKey,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        // Update existing
        const { error } = await supabase
          .from('app_settings')
          .update(updateData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('app_settings')
          .insert({
            ...updateData,
            qr_secret_key: qrSecretKey,
          });

        if (error) throw error;
      }

      toast.success('ההגדרות נשמרו בהצלחה!');
      await fetchSettings();
    } catch (error: any) {
      toast.error('שגיאה בשמירת ההגדרות', {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* GPS Settings */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            מיקום המגרש
          </CardTitle>
          <CardDescription>
            הגדר את קואורדינטות המגרש לאימות צ&apos;ק-אין (רדיוס 10 מטר)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude">קו רוחב (Latitude)</Label>
              <Input
                id="latitude"
                type="number"
                step="0.000001"
                placeholder="32.123456"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">קו אורך (Longitude)</Label>
              <Input
                id="longitude"
                type="number"
                step="0.000001"
                placeholder="34.123456"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                dir="ltr"
              />
            </div>
          </div>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={getCurrentLocation}
            disabled={gettingLocation}
          >
            {gettingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <Navigation className="h-4 w-4 ml-2" />
            )}
            קלוט מיקום נוכחי
          </Button>

          {latitude && longitude && (
            <div className="p-3 rounded-lg bg-secondary/50 text-sm">
              <p className="text-muted-foreground">מיקום נבחר:</p>
              <p className="font-mono" dir="ltr">
                {latitude}, {longitude}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Secret Key */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            מפתח QR סודי
          </CardTitle>
          <CardDescription>
            מפתח ייחודי לאימות סריקת QR (מינימום 60 תווים)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qrKey">מפתח סודי</Label>
            <div className="relative">
              <Input
                id="qrKey"
                type={showQrKey ? 'text' : 'password'}
                placeholder="מפתח סודי באורך 60+ תווים"
                value={qrSecretKey}
                onChange={(e) => setQrSecretKey(e.target.value)}
                className="pl-20 font-mono text-sm"
                dir="ltr"
              />
              <div className="absolute left-1 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowQrKey(!showQrKey)}
                >
                  {showQrKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={copyQrKey}
                  disabled={!qrSecretKey}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              אורך נוכחי: {qrSecretKey.length} תווים
              {qrSecretKey.length < 60 && (
                <span className="text-destructive mr-2">
                  (נדרש מינימום 60)
                </span>
              )}
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={generateQrKey}
          >
            <RefreshCw className="h-4 w-4 ml-2" />
            צור מפתח חדש
          </Button>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        className="w-full h-12 text-lg font-semibold neon-glow"
        onClick={handleSave}
        disabled={saving || qrSecretKey.length < 60}
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          'שמור הגדרות'
        )}
      </Button>
    </div>
  );
}
