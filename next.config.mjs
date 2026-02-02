import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pwa: {
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development",
    workboxOptions: {
      importScripts: ["https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js"],
    },
  },
};

export default withPWA(nextConfig);
