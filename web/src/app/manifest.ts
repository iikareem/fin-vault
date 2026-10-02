import type { MetadataRoute } from "next";

/** Lets “Add to Home Screen” open Fin Vault without Safari’s search/tool bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fin Vault",
    short_name: "Fin Vault",
    description:
      "House and personal cash, spending, and day-by-day history",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#edf4f0",
    theme_color: "#edf4f0",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
