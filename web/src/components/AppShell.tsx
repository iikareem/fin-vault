"use client";

import { I18nProvider } from "./I18nProvider";
import { BooksProvider } from "./BooksProvider";
import { ModeBar } from "./ModeBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <BooksProvider>
        <ModeBar />
        {children}
      </BooksProvider>
    </I18nProvider>
  );
}
