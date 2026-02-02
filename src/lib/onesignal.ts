import OneSignal from "react-onesignal";

const oneSignalConfig = {
  appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "",
  safari_web_id: process.env.NEXT_PUBLIC_SAFARI_WEB_ID,
  allowLocalhostAsSecureOrigin: true,
  serviceWorkerPath: "/OneSignalSDKWorker.js",
  serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
  serviceWorkerParam: { scope: "/" },
};

let initPromise: Promise<void> | null = null;

const ensureServiceWorker = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration || !registration.active) {
      await navigator.serviceWorker.register("/OneSignalSDKWorker.js", {
        scope: "/",
      });
    }
  } catch (error) {
    console.error("[OneSignal] Service worker registration failed", error);
  }
};

export const initOneSignal = async () => {
  if (typeof window === "undefined") {
    return;
  }

  if (!initPromise) {
    if (!oneSignalConfig.appId) {
      throw new Error("Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
    }

    await ensureServiceWorker();

    initPromise = OneSignal.init(oneSignalConfig).catch((error) => {
      if (error instanceof Error && error.message.includes("already initialized")) {
        return;
      }
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
};
