"use client";

import AuthWrapper from "@/components/AuthWrapper";
import Profile from "@/screens/Profile";

export default function ProfilePage() {
  return (
    <AuthWrapper>
      <Profile />
    </AuthWrapper>
  );
}
