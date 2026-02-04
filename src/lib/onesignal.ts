type OneSignalType = any;

declare global {
  interface Window {
    OneSignal?: OneSignalType;
  }
}

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

let initPromise: Promise<void> | null = null;

const isBrowser = () => typeof window !== "undefined";

const loadSdk = () => {
  if (!isBrowser()) return Promise.resolve();
  if (window.OneSignal) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/OneSignalSDK.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OneSignal SDK"));
    document.head.appendChild(script);
  });
};

const withOneSignal = async (callback: (os: OneSignalType) => void | Promise<void>) => {
  if (!isBrowser() || !window.OneSignal) return;

  await new Promise<void>((resolve) => {
    window.OneSignal!.push(async () => {
      await callback(window.OneSignal);
      resolve();
    });
  });
};

export const initOneSignal = async () => {
  if (!isBrowser()) return;
  if (!ONESIGNAL_APP_ID) {
    console.warn("Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
    return;
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    await loadSdk();
    window.OneSignal = window.OneSignal || [];

    await withOneSignal(async (os) => {
      console.info("[OneSignal] Using service worker path:", "sw.js");
      await os.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: "sw.js",
        serviceWorkerUpdaterPath: "sw.js",
        serviceWorkerParam: { scope: "/" },
        notifyButton: { enable: false },
      });
    });
  })();

  return initPromise;
};

export const setOneSignalExternalUserId = async (userId: string) => {
  if (!userId) return;
  await initOneSignal();

  await withOneSignal(async (os) => {
    if (typeof os.login === "function") {
      await os.login(userId);
      return;
    }

    if (typeof os.setExternalUserId === "function") {
      await os.setExternalUserId(userId);
    }
  });
};

export const clearOneSignalExternalUserId = async () => {
  await initOneSignal();

  await withOneSignal(async (os) => {
    if (typeof os.logout === "function") {
      await os.logout();
      return;
    }

    if (typeof os.removeExternalUserId === "function") {
      await os.removeExternalUserId();
    }
  });
};

export const requestPushPermission = async () => {
  if (!isBrowser() || !("Notification" in window)) return "denied" as NotificationPermission;
  await initOneSignal();

  let permission: NotificationPermission = Notification.permission;

  await withOneSignal(async (os) => {
    if (os.Notifications?.requestPermission) {
      permission = await os.Notifications.requestPermission();
      return;
    }

    if (typeof os.registerForPushNotifications === "function") {
      await os.registerForPushNotifications();
      permission = Notification.permission;
    }
  });

  return permission;
};

export const optInPush = async () => {
  await initOneSignal();

  await withOneSignal(async (os) => {
    if (os.User?.PushSubscription?.optIn) {
      await os.User.PushSubscription.optIn();
      return;
    }

    if (typeof os.setSubscription === "function") {
      await os.setSubscription(true);
    }
  });
};

export const optOutPush = async () => {
  await initOneSignal();

  await withOneSignal(async (os) => {
    if (os.User?.PushSubscription?.optOut) {
      await os.User.PushSubscription.optOut();
      return;
    }

    if (typeof os.setSubscription === "function") {
      await os.setSubscription(false);
    }
  });
};

export const isPushSupported = () => {
  if (!isBrowser()) return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  return true;
};

export const ensurePushOptIn = async () => {
  const permission = await requestPushPermission();
  if (permission !== "granted") return permission;
  await optInPush();
  return permission;
};

export const getPushSubscriptionStatus = async () => {
  await initOneSignal();

  let optedIn = false;
  let subscriptionId: string | null = null;

  await withOneSignal(async (os) => {
    if (os.User?.PushSubscription) {
      const optedInValue = os.User.PushSubscription.optedIn;
      if (typeof optedInValue === "boolean") {
        optedIn = optedInValue;
      } else if (typeof optedInValue === "function") {
        optedIn = await optedInValue();
      }

      const idValue = os.User.PushSubscription.id;
      if (typeof idValue === "string") {
        subscriptionId = idValue;
      } else if (typeof idValue === "function") {
        subscriptionId = await idValue();
      }
    }

    if (!subscriptionId && typeof os.getUserId === "function") {
      subscriptionId = await os.getUserId();
    }
  });

  return {
    optedIn,
    hasSubscription: Boolean(subscriptionId),
    subscriptionId,
  };
};
