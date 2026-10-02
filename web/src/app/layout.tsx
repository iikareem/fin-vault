import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "Fin Vault",
  description: "Fin Vault — personal cash, spending, goals, and day-by-day history",
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
    <html lang="en" dir="ltr" className={`${arabic.variable} h-full`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=document.documentElement;var lang=localStorage.getItem("fb_lang");if(lang==="ar"||lang==="en"){r.lang=lang;r.dir=lang==="ar"?"rtl":"ltr";}var t=localStorage.getItem("fb_theme")||"light";if(t==="ocean")t="blue";var ok={light:1,dark:1,blue:1,sand:1,rose:1};if(!ok[t])t="light";r.setAttribute("data-theme",t);if(t==="dark")r.classList.add("dark");else r.classList.remove("dark");var c={light:"#edf4f0",dark:"#06090e",blue:"#e7f1f8",sand:"#f2efe8",rose:"#fff5f8"};var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t]||c.light);}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full antialiased text-[var(--foreground)]">
        <noscript>
          This site needs JavaScript. On an older iPhone, update iOS or try Chrome.
        </noscript>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
