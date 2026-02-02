import withPWAInit from "@ducanh2912/next-pwa";

// 1. אתחול ה-PWA עם ההגדרות שלו בנפרד
const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development", // בטל ב-Dev כדי לא לשגע את הדפדפן
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
};

// 2. ייצוא הקונפיגורציה העטופה
export default withPWA(nextConfig);