"use client";

import { useEffect } from "react";
import { initOneSignal } from "@/lib/onesignal";

export function OneSignalClient() {
  useEffect(() => {
    initOneSignal();
  }, []);

  return null;
}
