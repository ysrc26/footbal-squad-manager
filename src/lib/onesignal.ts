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

export const initOneSignal = async () => {
  if (typeof window === "undefined") {
    return;
  }

  if (!initPromise) {
    if (!oneSignalConfig.appId) {
      throw new Error("Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
    }

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
