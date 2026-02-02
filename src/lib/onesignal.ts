import OneSignal from "react-onesignal";

const oneSignalConfig = {
  appId: "76992db9-49f0-4ad6-9d56-a04be4578212",
  safari_web_id: "web.onesignal.auto.34cabfa2-ddd9-46d0-b8b2-6fad793020e0",
  allowLocalhostAsSecureOrigin: true,
  serviceWorkerPath: "OneSignalSDKWorker.js",
};

let initPromise: Promise<void> | null = null;

export const initOneSignal = async () => {
  if (!initPromise) {
    initPromise = OneSignal.init(oneSignalConfig).catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
};
