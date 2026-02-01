// src/components/AuthWrapper.tsx
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
    // הוספנו תנאי: תריץ את זה רק אם אנחנו לא כבר בודקים
    if (!loading && user && !profile && !checkingProfile) {
      setCheckingProfile(true);
      
      const ensureProfile = async () => {
        try {
          const { error } = await supabase.from('profiles').upsert({
            id: user.id,
            full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
            avatar_url: user.user_metadata?.avatar_url ?? null,
            // אנחנו לא דורסים את הטלפון אם הוא קיים, ה-upsert מטפל בזה
          }, { onConflict: 'id' }); // חשוב לוודא שלא נוצרות כפילויות

          if (error) throw error;
          
          // מושכים את הפרופיל העדכני מיד אחרי היצירה
          await refreshProfile();
          
        } catch (error: any) {
          console.error("Profile creation error:", error);
          toast.error('שגיאה ביצירת פרופיל משתמש');
        } finally {
          setCheckingProfile(false);
        }
      };

      ensureProfile();
    }
  }, [loading, user, profile, checkingProfile, refreshProfile]);

  // 1. קודם כל מטפלים בטעינה הכללית
  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 2. אם אין יוזר בכלל - זרוק ללוגין
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. התיקון הקריטי: אם יש יוזר אבל הפרופיל עדיין לא נטען (למרות שסיימנו loading)
  // זה אומר שאנחנו בשלב ביניים - עדיף להציג טעינה מאשר לזרוק החוצה
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 4. עכשיו בטוח יש פרופיל, אפשר לבדוק טלפון
  if (!profile.phone_number) {
    return <Navigate to="/onboarding" replace />;
  }

  // 5. בדיקת אדמין אם צריך
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}