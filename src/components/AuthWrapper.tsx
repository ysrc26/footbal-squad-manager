import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthWrapperProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function AuthWrapper({ children, requireAdmin = false }: AuthWrapperProps) {
  const { user, profile, isAdmin, loading, refreshProfile } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);

  useEffect(() => {
    if (!loading && user && profile === null && !checkingProfile) {
      setCheckingProfile(true);
      const ensureProfile = async () => {
        const { error } = await supabase.from('profiles').upsert({
          id: user.id,
          full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        });
        if (error) {
          throw error;
        }
      };

      ensureProfile()
        .then(() => refreshProfile())
        .catch(() => {
          toast.error('שגיאה בהתחברות, אנא נסה שנית');
        })
        .finally(() => setCheckingProfile(false));
    }
  }, [loading, user, profile, checkingProfile, refreshProfile]);

  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.phone_number == null) {
    return <Navigate to="/onboarding" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
