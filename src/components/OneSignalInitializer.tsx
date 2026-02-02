"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { toast } from "sonner";

export default function OneSignalInitializer({ userId }: { userId?: string }) {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const initialize = async () => {
      if (initializedRef.current) {
        console.log("[OneSignal] init skipped (already initialized)");
        return;
      }

      console.log("[OneSignal] init start");

      try {
        const appId =
          process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ??
          "76992db9-49f0-4ad6-9d56-a04be4578212";
        const safariWebId = process.env.NEXT_PUBLIC_SAFARI_WEB_ID;

        await OneSignal.init({
          appId,
          safari_web_id: safariWebId,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: "/OneSignalSDKWorker.js",
        });

        initializedRef.current = true;
        console.log("[OneSignal] init success");

        OneSignal.Notifications.addEventListener(
          "foregroundWillDisplay",
          (event) => {
            console.log("[OneSignal] foreground notification received", event);
            event.preventDefault();
            const notif = event.getNotification();
            toast(notif.title || "הודעה חדשה", {
              description: notif.body,
              action: {
                label: "פתח",
                onClick: () => console.log("[OneSignal] Notification clicked"),
              },
            });
          },
        );
      } catch (error) {
        console.error("[OneSignal] init failed", error);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!userId) {
      return;
    }

    console.log("[OneSignal] ensuring login for", userId);
    OneSignal.login(userId);
  }, [userId]);

  return null;
}
