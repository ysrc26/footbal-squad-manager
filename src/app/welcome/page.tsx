"use client";

import AuthWrapper from "@/components/AuthWrapper";
import Welcome from "@/screens/Welcome";

export default function WelcomePage() {
  return (
    <AuthWrapper>
      <Welcome />
    </AuthWrapper>
  );
}
