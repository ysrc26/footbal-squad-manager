"use client";

import AuthWrapper from "@/components/AuthWrapper";
import Dashboard from "@/screens/Dashboard";

export default function DashboardPage() {
  return (
    <AuthWrapper>
      <Dashboard />
    </AuthWrapper>
  );
}
