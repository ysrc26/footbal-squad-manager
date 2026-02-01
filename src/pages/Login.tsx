import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Phone, Shield } from 'lucide-react';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const { signInWithOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const formatPhoneNumber = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    // Format for Israeli phone numbers
    if (digits.startsWith('972')) {
      return '+' + digits;
    } else if (digits.startsWith('0')) {
      return '+972' + digits.slice(1);
    }
    return '+972' + digits;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const formattedPhone = formatPhoneNumber(phone);
    const { error } = await signInWithOtp(formattedPhone);
    
    if (error) {
      toast.error('שגיאה בשליחת קוד האימות', {
        description: error.message,
      });
    } else {
      toast.success('קוד אימות נשלח!', {
        description: 'בדוק את הודעות ה-SMS שלך',
      });
      setStep('otp');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const formattedPhone = formatPhoneNumber(phone);
    const { error } = await verifyOtp(formattedPhone, otp);
    
    if (error) {
      toast.error('קוד אימות שגוי', {
        description: 'נא לנסות שוב',
      });
    } else {
      toast.success('התחברת בהצלחה!');
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-dark">
      <Card className="w-full max-w-md glass neon-border animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center neon-glow">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold neon-text">כדורגל נהלים</CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === 'phone' 
              ? 'הזן את מספר הטלפון שלך להתחברות'
              : 'הזן את קוד האימות שנשלח אליך'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="050-000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pr-10 text-lg h-12"
                  dir="ltr"
                  required
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
                  'שלח קוד אימות'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                type="text"
                placeholder="הזן קוד 6 ספרות"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="text-center text-2xl tracking-widest h-14"
                maxLength={6}
                dir="ltr"
                required
              />
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold neon-glow"
                disabled={loading}
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
