import "@/index.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import OneSignalInitializer from "@/components/OneSignalInitializer";

export const metadata = {
  title: "כדורגל נחלים",
  description: "מערכת ניהול קבוצת כדורגל",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FSM",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <OneSignalInitializer />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
