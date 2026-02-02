import "@/index.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "כדורגל נחלים",
  description: "מערכת ניהול קבוצת כדורגל",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
