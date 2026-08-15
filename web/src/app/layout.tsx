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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${arabic.variable} h-full`}>
      <body className="min-h-full text-stone-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
