//  src/components/OneSignalInitializer.tsx
"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function OneSignalInitializer({ userId }: { userId?: string }) {
  const initializedRef = useRef(false);
  const lastSavedIdRef = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // 1. אתחול חד פעמי של OneSignal
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialize = async () => {
      if (initializedRef.current) return;

      if (!initPromiseRef.current) {
        console.log("[OneSignal] Init start");
        const existingPromise = (window as Window & {
          __oneSignalInitPromise?: Promise<void>;
          __oneSignalInitDone?: boolean;
        }).__oneSignalInitPromise;

        if (existingPromise) {
          initPromiseRef.current = existingPromise;
        } else {
          initPromiseRef.current = (async () => {
          const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
          const safariWebId = process.env.NEXT_PUBLIC_SAFARI_WEB_ID;

          if (!appId) {
            console.error("[OneSignal] Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
            return;
          }

          await OneSignal.init({
            appId,
            safari_web_id: safariWebId,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
            serviceWorkerParam: { scope: "/" },
          });

          initializedRef.current = true;
          (window as Window & { __oneSignalInitDone?: boolean }).__oneSignalInitDone = true;
          console.log("[OneSignal] Init success");

          // מאזין להודעות כשהאפליקציה פתוחה (Foreground)
          OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
            console.log("[OneSignal] Foreground notification received", event);
            event.preventDefault();
            const notif = event.notification;
            toast(notif.title || "הודעה חדשה", {
              description: notif.body,
              action: {
                label: "פתח",
                onClick: () => console.log("[OneSignal] Notification clicked"),
              },
            });
          });
          })().catch((error) => {
            initPromiseRef.current = null;
            (window as Window & { __oneSignalInitPromise?: Promise<void> }).__oneSignalInitPromise = undefined;
            console.error("[OneSignal] Init failed", error);
          });

          (window as Window & { __oneSignalInitPromise?: Promise<void> }).__oneSignalInitPromise = initPromiseRef.current;
        }
      }
      await initPromiseRef.current;
    };

    initialize();
  }, []);

  // 2. טיפול בחיבור משתמש ורישום לדאטה-בייס
  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    // תיקון קריטי: איפוס ה-ref כשהמשתמש מתחלף כדי להבטיח שמירה מחדש
    lastSavedIdRef.current = null; 

    const saveSubscriptionId = async (subscriptionId: string) => {
      // מניעת כתיבות כפולות לאותו סשן
      if (lastSavedIdRef.current === subscriptionId) {
        return;
      }

      console.log(`[OneSignal] Saving subscription ID: ${subscriptionId} for user: ${userId}`);
      
      const { error } = await supabase
        .from("profiles")
        .update({ onesignal_id: subscriptionId })
        .eq("id", userId);

      if (error) {
        console.error("[OneSignal] Failed to persist subscription ID", error);
      } else {
        lastSavedIdRef.current = subscriptionId;
        console.log("[OneSignal] Successfully persisted subscription ID to DB");
      }
    };

    const handleSubscriptionChange = (event: any) => {
      const subscriptionId = event?.current?.id ?? OneSignal.User.PushSubscription.id;
      if (subscriptionId) {
        saveSubscriptionId(subscriptionId);
      }
    };

    const ensureLogin = async () => {
      try {
        // המתנה לאתחול (Init)
        if (initPromiseRef.current) {
          await initPromiseRef.current;
        } else if (!initializedRef.current) {
          console.log("[OneSignal] Login waiting for init...");
          await new Promise<void>((resolve) => {
             const check = setInterval(() => {
               if (initializedRef.current) {
                 clearInterval(check);
                 resolve();
               }
             }, 100);
             // Timeout ביטחון של 5 שניות
             setTimeout(() => { clearInterval(check); resolve(); }, 5000); 
          });
        }

        if (!initializedRef.current) {
           console.error("[OneSignal] Cannot login - Init failed or timed out");
           return;
        }

        console.log("[OneSignal] Logging in user:", userId);
        await OneSignal.login(userId);

        // בקשת הרשאה אם עדיין אין (חשוב למשתמשים חדשים!)
        if (!OneSignal.Notifications.permission) {
             console.log("[OneSignal] Requesting permission...");
             await OneSignal.Notifications.requestPermission();
        }

        // ניסיון לשמור את ה-ID הקיים
        const subscriptionId = OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          saveSubscriptionId(subscriptionId);
        } else {
          console.log("[OneSignal] No subscription ID yet (User might need to allow notifications)");
        }

        // האזנה לשינויים עתידיים (למשל אם המשתמש יאשר פתאום)
        OneSignal.User.PushSubscription.addEventListener("change", handleSubscriptionChange);

      } catch (error) {
        console.error("[OneSignal] Login sequence failed", error);
      }
    };

    ensureLogin();

    return () => {
      try {
        OneSignal.User.PushSubscription.removeEventListener?.("change", handleSubscriptionChange);
      } catch (e) { /* ignore cleanup errors */ }
    };
  }, [userId]);

  return null;
}
