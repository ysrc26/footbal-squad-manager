/* eslint-disable no-undef */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js");

self.__WB_DISABLE_DEV_LOGS = true;

if (self.workbox) {
  self.workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);
}
