"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && user && !profile && !checkingProfile) {
      setCheckingProfile(true);

      const ensureProfile = async () => {
        try {
          const { error } = await supabase.from('profiles').upsert(
            {
              id: user.id,
              full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
              avatar_url: user.user_metadata?.avatar_url ?? null,
              phone_number: user.phone ?? null,
            },
            { onConflict: 'id' }
          );

          if (error) throw error;

          await refreshProfile();
        } catch (error: any) {
          console.error('Profile creation error:', error);
          toast.error('שגיאה ביצירת פרופיל משתמש');
        } finally {
          setCheckingProfile(false);
        }
      };

      ensureProfile();
    }
  }, [loading, user, profile, checkingProfile, refreshProfile]);

  useEffect(() => {
    if (!user || !profile) return;
    if (!user.phone || profile.phone_number) return;

    const syncPhone = async () => {
      await supabase
        .from('profiles')
        .update({ phone_number: user.phone, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      await refreshProfile();
    };

    syncPhone();
  }, [user, profile, refreshProfile]);

  useEffect(() => {
    if (loading || checkingProfile) return;

    if (!user) {
      setRedirecting(true);
      router.replace('/login');
      return;
    }

    if (!profile) {
      setRedirecting(false);
      return;
    }

    const hasFullName = Boolean(profile.full_name?.trim());
    const hasVerifiedPhone = Boolean(user.phone);
    const onWelcome = pathname === '/welcome';

    if (!hasVerifiedPhone || !hasFullName) {
      if (!onWelcome) {
        setRedirecting(true);
        router.replace('/welcome');
        return;
      }
      setRedirecting(false);
      return;
    }

    if (onWelcome) {
      setRedirecting(true);
      router.replace('/dashboard');
      return;
    }

    if (requireAdmin && !isAdmin) {
      setRedirecting(true);
      router.replace('/dashboard');
      return;
    }

    setRedirecting(false);
  }, [loading, checkingProfile, user, user?.phone, profile?.full_name, requireAdmin, isAdmin, router, pathname]);

  if (loading || checkingProfile || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
