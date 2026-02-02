"use client";

import AuthWrapper from "@/components/AuthWrapper";
import Admin from "@/screens/Admin";

export default function AdminPage() {
  return (
    <AuthWrapper requireAdmin>
      <Admin />
    </AuthWrapper>
  );
}
