"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { supabase } from "@/integrations/supabase/client";
import { initOneSignal } from "@/lib/onesignal";

interface OneSignalInitializerProps {
  userId?: string | null;
}

export default function OneSignalInitializer({ userId }: OneSignalInitializerProps) {
  const lastSavedIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const saveSubscriptionId = async (subscriptionId: string) => {
      if (!userId) {
        return;
      }

      if (lastSavedIdRef.current === subscriptionId) {
        return;
      }

      await supabase
        .from("profiles")
        .update({ onesignal_id: subscriptionId })
        .eq("id", userId);

      lastSavedIdRef.current = subscriptionId;
    };

    const handleSubscriptionChange = async () => {
      if (!isActive || !userId) {
        return;
      }

      const subscriptionId = OneSignal.User.PushSubscription.id;
      if (subscriptionId) {
        await saveSubscriptionId(subscriptionId);
      }
    };

    const initialize = async () => {
      try {
        await initOneSignal();
        if (!isActive) {
          return;
        }

        if (!OneSignal.Notifications.permission) {
          await OneSignal.Slidedown.promptPush();
        }

        if (userId) {
          await OneSignal.login(userId);
          const subscriptionId = OneSignal.User.PushSubscription.id;
          if (subscriptionId) {
            await saveSubscriptionId(subscriptionId);
          }

          OneSignal.User.PushSubscription.addEventListener("change", handleSubscriptionChange);
        }
      } catch (error) {
        console.error("OneSignal init failed", error);
      }
    };

    initialize();

    return () => {
      isActive = false;
      if (userId) {
        OneSignal.User.PushSubscription.removeEventListener?.("change", handleSubscriptionChange);
      }
    };
  }, [userId]);

  return null;
}
