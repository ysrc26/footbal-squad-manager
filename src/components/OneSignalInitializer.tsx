"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function OneSignalInitializer({ userId }: { userId?: string }) {
  const initializedRef = useRef(false);
  const lastSavedIdRef = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const initialize = async () => {
      if (initializedRef.current) {
        console.log("[OneSignal] init skipped (already initialized)");
        return;
      }

      if (!initPromiseRef.current) {
        console.log("[OneSignal] init start");
        initPromiseRef.current = (async () => {
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
        })().catch((error) => {
          initPromiseRef.current = null;
          console.error("[OneSignal] init failed", error);
          throw error;
        });
      }

      await initPromiseRef.current;
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

    const saveSubscriptionId = async (subscriptionId: string) => {
      if (lastSavedIdRef.current === subscriptionId) {
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ onesignal_id: subscriptionId })
        .eq("id", userId);

      if (error) {
        console.error("[OneSignal] failed to persist subscription id", error);
        return;
      }

      lastSavedIdRef.current = subscriptionId;
      console.log("[OneSignal] persisted subscription id", subscriptionId);
    };

    const handleSubscriptionChange = (event: any) => {
      const subscriptionId =
        event?.current?.id ?? OneSignal.User.PushSubscription.id;

      if (subscriptionId) {
        saveSubscriptionId(subscriptionId);
      }
    };

    const ensureLogin = async () => {
      try {
        if (initPromiseRef.current) {
          await initPromiseRef.current;
        } else if (!initializedRef.current) {
          console.log("[OneSignal] login waiting for init");
          await new Promise<void>((resolve, reject) => {
            let attempts = 0;
            const interval = setInterval(() => {
              if (initPromiseRef.current) {
                clearInterval(interval);
                initPromiseRef.current
                  .then(() => resolve())
                  .catch((error) => reject(error));
                return;
              }

              if (initializedRef.current) {
                clearInterval(interval);
                resolve();
                return;
              }

              attempts += 1;
              if (attempts >= 20) {
                clearInterval(interval);
                reject(new Error("OneSignal init timed out"));
              }
            }, 250);
          });
        }

        console.log("[OneSignal] ensuring login for", userId);
        await OneSignal.login(userId);

        const subscriptionId = OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          saveSubscriptionId(subscriptionId);
        }

        OneSignal.User.PushSubscription.addEventListener(
          "change",
          handleSubscriptionChange,
        );
      } catch (error) {
        console.error("[OneSignal] login failed", error);
      }
    };

    ensureLogin();

    return () => {
      OneSignal.User.PushSubscription.removeEventListener?.(
        "change",
        handleSubscriptionChange,
      );
    };
  }, [userId]);

  return null;
}
