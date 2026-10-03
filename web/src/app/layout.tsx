import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { themeColorMap } from "@/lib/themes";

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
    /*
      black-translucent lets .app-top-chrome paint the status-bar zone.
      `default` is an opaque white system bar (the iPhone dark-theme bug).
      Boot script switches light themes back to `default` for dark icons.
    */
    statusBarStyle: "black-translucent",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#06090e" },
  ],
};

/** Runs before paint so saved theme/lang win over SSR defaults. */
const BOOT_SCRIPT = `(()=>{try{var r=document.documentElement;var lang=localStorage.getItem("fb_lang");if(lang==="ar"||lang==="en"){r.lang=lang;r.dir=lang==="ar"?"rtl":"ltr";}var t=localStorage.getItem("fb_theme")||"light";if(t==="ocean")t="blue";var ok={light:1,dark:1,midnight:1,blue:1,mint:1,forest:1,sand:1,amber:1,rose:1,grape:1,slate:1};if(!ok[t])t="light";r.setAttribute("data-theme",t);var dark=t==="dark"||t==="midnight";if(dark)r.classList.add("dark");else r.classList.remove("dark");r.style.colorScheme=dark?"dark":"light";var c=${JSON.stringify(themeColorMap())};var color=c[t]||c.light;r.style.backgroundColor=color;function setMeta(name,content){var nodes=document.querySelectorAll('meta[name="'+name+'"]');if(!nodes.length){var el=document.createElement("meta");el.setAttribute("name",name);el.setAttribute("content",content);document.head.appendChild(el);return;}for(var i=0;i<nodes.length;i++)nodes[i].setAttribute("content",content);}setMeta("theme-color",color);setMeta("apple-mobile-web-app-status-bar-style",dark?"black-translucent":"default");var p=localStorage.getItem("fb_ui_prefs");if(p){var u=JSON.parse(p);if(u.hideBalances)r.setAttribute("data-hide-balances","");if(u.reduceMotion)r.setAttribute("data-reduce-motion","");if(u.compactUi)r.setAttribute("data-compact","");}function ready(){r.classList.add("app-ready");}requestAnimationFrame(function(){requestAnimationFrame(ready);});setTimeout(ready,400);}catch(e){try{document.documentElement.classList.add("app-ready");}catch(_){}}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${arabic.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body
        className="min-h-full antialiased text-[var(--foreground)]"
        suppressHydrationWarning
      >
        <noscript>
          This site needs JavaScript. On an older iPhone, update iOS or try Chrome.
        </noscript>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
