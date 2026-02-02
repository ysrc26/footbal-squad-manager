"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { supabase } from "@/integrations/supabase/client";
import { initOneSignal } from "@/lib/onesignal";
import { toast } from "sonner";

interface OneSignalInitializerProps {
  userId?: string | null;
}

export default function OneSignalInitializer({ userId }: OneSignalInitializerProps) {
  const lastSavedIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const handleForegroundNotification = (event: any) => {
      event.preventDefault();

      const title =
        event?.notification?.title ??
        event?.notification?.headings?.en ??
        "Notification";
      const body =
        event?.notification?.body ??
        event?.notification?.contents?.en ??
        "";

      toast(title, {
        description: body,
        action: {
          label: "View",
          onClick: () => console.log("Clicked"),
        },
      });
    };

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

        OneSignal.Notifications.addEventListener(
          "foregroundWillDisplay",
          handleForegroundNotification,
        );

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
      OneSignal.Notifications.removeEventListener?.(
        "foregroundWillDisplay",
        handleForegroundNotification,
      );
    };
  }, [userId]);

  return null;
}
