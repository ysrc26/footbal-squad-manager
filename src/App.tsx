import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AuthWrapper from "@/components/AuthWrapper";
import { toast } from "sonner";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Rules from "./pages/Rules";
import Admin from "./pages/Admin";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function AuthenticatedRedirect() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(false);

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
  
  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (user) {
    if (!profile?.phone_number) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthenticatedRedirect />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <AuthWrapper>
            <Dashboard />
          </AuthWrapper>
        }
      />
      <Route
        path="/profile"
        element={
          <AuthWrapper>
            <Profile />
          </AuthWrapper>
        }
      />
      <Route
        path="/rules"
        element={
          <AuthWrapper>
            <Rules />
          </AuthWrapper>
        }
      />
      <Route
        path="/admin"
        element={
          <AuthWrapper requireAdmin>
            <Admin />
          </AuthWrapper>
        }
      />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
