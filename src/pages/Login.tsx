// src/pages/Login.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Chrome, Loader2, Shield } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    // התיקון כאן: הוספנו את options עם redirectTo
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`
      }
    });
    
    if (error) {
      toast.error('שגיאה בהתחברות עם Google', {
        description: error.message,
      });
      setLoading(false);
    }
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
            התחבר עם Google כדי להמשיך
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            className="w-full h-12 text-lg font-semibold neon-glow"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Chrome className="h-5 w-5 ml-2" />
                התחברות עם Google
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
