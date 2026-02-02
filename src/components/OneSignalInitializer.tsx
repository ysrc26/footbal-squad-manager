"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";
import { initOneSignal } from "@/lib/onesignal";

export default function OneSignalInitializer() {
  useEffect(() => {
    let isActive = true;

    const initialize = async () => {
      try {
        await initOneSignal();
        if (!isActive) {
          return;
        }

        if (!OneSignal.Notifications.permission) {
          await OneSignal.Slidedown.promptPush();
        }
      } catch (error) {
        console.error("OneSignal init failed", error);
      }
    };

    initialize();

    return () => {
      isActive = false;
    };
  }, []);

  return null;
}
