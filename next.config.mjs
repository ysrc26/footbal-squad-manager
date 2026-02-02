import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pwa: {
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development",
    swSrc: "src/sw.js",
  },
};

export default withPWA(nextConfig);
