"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import OneSignalInitializer from "@/components/OneSignalInitializer";
import NotificationsPrompt from "@/components/NotificationsPrompt";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <OneSignalGate />
          {children}
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function OneSignalGate() {
  const { user } = useAuth();
  return (
    <>
      <OneSignalInitializer userId={user?.id} />
      <NotificationsPrompt />
    </>
  );
}
