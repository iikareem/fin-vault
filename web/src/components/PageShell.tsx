"use client";

export function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={`page-shell ${className}`}>{children}</main>;
}
