"use client";

import { I18nProvider } from "./I18nProvider";
import { BooksProvider } from "./BooksProvider";
import { ModeBar } from "./ModeBar";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import { OfflineSync } from "./OfflineSync";

/**
 * Split chrome vs scroll on purpose for iOS PWAs:
 * the status-bar / Dynamic Island zone is a non-scrolling solid strip.
 * Page content scrolls in a separate layer below it, so Hello / charts
 * never sit under the system frosted-edge blur.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <BooksProvider>
        <ServiceWorkerRegister />
        <div className="app-root">
          <div aria-hidden className="app-top-chrome" />
          <div className="app-scroll">
            <div aria-hidden className="app-atmosphere" />
            <div className="app-scroll-content">
              <ModeBar />
              <OfflineSync />
              {children}
            </div>
          </div>
        </div>
      </BooksProvider>
    </I18nProvider>
  );
}
