"use client";

import { I18nProvider } from "./I18nProvider";
import { BooksProvider } from "./BooksProvider";
import { ModeBar } from "./ModeBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <BooksProvider>
        {/* Always on — covers Dynamic Island even on login/register. */}
        <div aria-hidden className="ios-top-mask" />
        <ModeBar />
        {children}
      </BooksProvider>
    </I18nProvider>
  );
}
