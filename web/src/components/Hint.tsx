export function Hint({ children }: { children: string }) {
  if (!children) return null;
  return <p className="mt-1 text-sm leading-relaxed text-stone-500">{children}</p>;
}
