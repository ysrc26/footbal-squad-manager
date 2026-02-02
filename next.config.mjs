import withPWA from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pwa: {
    dest: "public",
    register: false,
    skipWaiting: false,
    disable: process.env.NODE_ENV === "development",
  },
};

export default withPWA(nextConfig);
