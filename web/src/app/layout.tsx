import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "مال البيت",
  description: "فلوس البيت، المدفوعات، وتاريخ كل يوم",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "مال البيت",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#edf4f0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`${arabic.variable} h-full`}>
      <body className="min-h-full text-stone-900 antialiased">
        <noscript>
          هذا الموقع يحتاج جافاسكريبت. لو الآيفون قديم، حدّثي النظام أو جرّبي كروم.
        </noscript>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
