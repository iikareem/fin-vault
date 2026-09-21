"use client";

/** Full-width date control that never overflows on mobile (native date min-width). */
export function DateField({
  label,
  value,
  min,
  max,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
        {label}
      </span>
      <span className="field relative flex min-h-[3.25rem] w-full min-w-0 max-w-full items-center overflow-hidden !py-0">
        <span
          className="min-w-0 flex-1 truncate text-base font-semibold tabular-nums"
          dir="ltr"
        >
          {value || "—"}
        </span>
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label={label}
        />
      </span>
    </label>
  );
}
