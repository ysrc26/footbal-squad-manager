import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, QrCode, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export function QrCodeGenerator() {
  const [qrSecretKey, setQrSecretKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQrKey = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('qr_secret_key')
        .maybeSingle();

      if (error) throw error;

      setQrSecretKey(data?.qr_secret_key || null);
    } catch (error: any) {
      toast.error('שגיאה בטעינת מפתח QR', {
        description: error.message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQrKey();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchQrKey();
  };

  const downloadQrCode = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    // Convert SVG to canvas and download
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      
      if (ctx) {
        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      const link = document.createElement('a');
      link.download = 'nahalim-football-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success('קוד QR הורד בהצלחה!');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!qrSecretKey || qrSecretKey.length < 60) {
    return (
      <Card className="glass border-destructive/50">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-lg mb-2">מפתח QR לא מוגדר</h3>
            <p className="text-muted-foreground text-sm">
              יש להגדיר מפתח QR סודי (60+ תווים) בהגדרות האפליקציה לפני יצירת קוד QR
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
          >
            חזור להגדרות
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            קוד QR לצ'ק-אין
          </CardTitle>
          <CardDescription>
            הצג קוד זה לשחקנים במגרש לצורך אימות נוכחות
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {/* QR Code Display */}
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <QRCodeSVG
              id="qr-code-svg"
              value={qrSecretKey}
              size={200}
              level="H"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          {/* Info */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              השחקנים יסרקו את הקוד באפליקציה
            </p>
            <p className="text-xs text-muted-foreground">
              הסריקה תעבוד רק ברדיוס 10 מטר מהמגרש
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <RefreshCw className="h-4 w-4 ml-2" />
              )}
              רענן
            </Button>
            <Button
              className="flex-1 neon-glow"
              onClick={downloadQrCode}
            >
              <Download className="h-4 w-4 ml-2" />
              הורד QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">הוראות שימוש</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
              1
            </span>
            <p>הצג את קוד ה-QR במגרש לפני תחילת המשחק</p>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
              2
            </span>
            <p>שחקנים רשומים יסרקו את הקוד מהאפליקציה שלהם</p>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
              3
            </span>
            <p>הסריקה תצליח רק אם השחקן נמצא ברדיוס 10 מטר מהמגרש</p>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
              4
            </span>
            <p>לאחר סריקה מוצלחת, הנוכחות תירשם אוטומטית</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
