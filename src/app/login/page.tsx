"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Login from "@/screens/Login";

export default function LoginPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && profile === null && !checkingProfile) {
      setCheckingProfile(true);
      const ensureProfile = async () => {
        const { error } = await supabase.from("profiles").upsert({
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
          toast.error("שגיאה בהתחברות, אנא נסה שנית");
        })
        .finally(() => setCheckingProfile(false));
    }
  }, [loading, user, profile, checkingProfile, refreshProfile]);

  useEffect(() => {
    if (loading || checkingProfile) return;
    if (!user) return;

    if (!profile?.phone_number) {
      router.replace("/onboarding");
      return;
    }

    router.replace("/dashboard");
  }, [loading, checkingProfile, user, profile?.phone_number, router]);

  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Login />;
}
