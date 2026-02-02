//  src/components/OneSignalInitializer.tsx
"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { initOneSignal } from "@/lib/onesignal";

export default function OneSignalInitializer({ userId }: { userId?: string }) {
  const initializedRef = useRef(false);
  const lastSavedIdRef = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const foregroundListenerRef = useRef(false);

  // 1. אתחול חד פעמי של OneSignal
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialize = async () => {
      if (initializedRef.current) return;

      if (!initPromiseRef.current) {
        console.log("[OneSignal] Init start");
        initPromiseRef.current = initOneSignal();
      }
      try {
        await initPromiseRef.current;
      } catch (error) {
        initPromiseRef.current = null;
        console.error("[OneSignal] Init failed", error);
        return;
      }

      if (!initializedRef.current) {
        initializedRef.current = true;
        console.log("[OneSignal] Init success");
      }

      if (!foregroundListenerRef.current) {
        foregroundListenerRef.current = true;
        // מאזין להודעות כשהאפליקציה פתוחה (Foreground)
        OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
          console.log("[OneSignal] Foreground notification received", event);
          // Some browsers don't allow preventing the native display in foreground.
          // We avoid calling preventDefault to keep system notifications working.
          const notif = event.notification;
          toast(notif.title || "הודעה חדשה", {
            description: notif.body,
            action: {
              label: "פתח",
              onClick: () => console.log("[OneSignal] Notification clicked"),
            },
          });
        });
      }
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
