import "@/index.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

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
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
