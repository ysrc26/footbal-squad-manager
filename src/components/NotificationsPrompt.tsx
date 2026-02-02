"use client";

import { useEffect, useState } from "react";
import OneSignal from "react-onesignal";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { initOneSignal } from "@/lib/onesignal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PROMPT_STORAGE_KEY = "onesignal_prompt_dismissed";

export default function NotificationsPrompt() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile?.phone_number) {
      setOpen(false);
      return;
    }

    const storageKey = `${PROMPT_STORAGE_KEY}:${user.id}`;
    if (localStorage.getItem(storageKey) === "1") return;

    let cancelled = false;
    const check = async () => {
      try {
        await initOneSignal();
        if (!OneSignal.Notifications.isPushSupported()) return;

        const permission = String(OneSignal.Notifications.permission);
        const subscriptionId = OneSignal.User.PushSubscription?.id;

        if (subscriptionId) return;
        if (permission === "denied") return;

        if (!cancelled) setOpen(true);
      } catch (error) {
        console.error(error);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.phone_number]);

  const handleLater = () => {
    if (user?.id) {
      localStorage.setItem(`${PROMPT_STORAGE_KEY}:${user.id}`, "1");
    }
    setOpen(false);
  };

  const handleEnable = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await initOneSignal();
      if (!OneSignal.Notifications.isPushSupported()) {
        toast.error("הדפדפן/המכשיר לא תומך בהתראות");
        return;
      }

      const permission = await OneSignal.Notifications.requestPermission();
      if (permission !== "granted") {
        toast.error("ההרשאה נדחתה. אפשר להפעיל בהגדרות הדפדפן");
        handleLater();
        return;
      }

      await OneSignal.login(user.id);
      toast.success("ההתראות הופעלו בהצלחה");
      localStorage.setItem(`${PROMPT_STORAGE_KEY}:${user.id}`, "1");
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("שגיאה בהפעלת התראות");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleLater();
        } else {
          setOpen(true);
        }
      }}
    >
      <AlertDialogContent className="glass border-border/50">
        <AlertDialogHeader>
          <AlertDialogTitle>לקבל התראות מהמערכת?</AlertDialogTitle>
          <AlertDialogDescription>
            תקבל עדכונים על משחקים, שינויים והרשמות. אפשר לבטל בכל עת בהגדרות.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={handleLater} disabled={loading}>
            לא עכשיו
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleEnable} disabled={loading}>
            {loading ? "מפעיל..." : "כן, הפעל"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
