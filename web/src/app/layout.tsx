import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "Fin Vault · مال البيت",
  description: "Fin Vault — house and personal cash, spending, and day-by-day history",
  applicationName: "Fin Vault",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fin Vault",
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fb_theme")||"light";if(t==="ocean")t="blue";var ok={light:1,dark:1,blue:1,sand:1,rose:1};if(!ok[t])t="light";var r=document.documentElement;r.setAttribute("data-theme",t);if(t==="dark")r.classList.add("dark");else r.classList.remove("dark");var c={light:"#edf4f0",dark:"#0b110f",blue:"#e7f1f8",sand:"#f2efe8",rose:"#fceef3"};var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t]||c.light);}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full antialiased text-[var(--foreground)]">
        <noscript>
          هذا الموقع يحتاج جافاسكريبت. لو الآيفون قديم، حدّثي النظام أو جرّبي كروم.
        </noscript>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
