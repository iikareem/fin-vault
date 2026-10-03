"use client";

import { I18nProvider } from "./I18nProvider";
import { BooksProvider } from "./BooksProvider";
import { ModeBar } from "./ModeBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <BooksProvider>
        {/* Solid cover for the status bar / Dynamic Island (overscroll-safe). */}
        <div aria-hidden className="ios-top-mask" />
        <div className="app-frame">
          {/* Gradients live here — never on body — so iOS won't frost the top. */}
          <div aria-hidden className="app-atmosphere" />
          <div className="app-frame-content">
            <ModeBar />
            {children}
          </div>
        </div>
      </BooksProvider>
    </I18nProvider>
  );
}
