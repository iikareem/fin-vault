"use client";

/** Full-width date/month control that never overflows on mobile (native min-width). */
export function DateField({
  label,
  value,
  min,
  max,
  onChange,
  type = "date",
  align = "start",
  className = "",
}: {
  label?: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  type?: "date" | "month";
  align?: "start" | "center";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <label className={`block min-w-0 ${className}`}>
      {label ? (
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
          {label}
        </span>
      ) : null}
      <span
        className={`field relative flex min-h-[3.25rem] w-full min-w-0 max-w-full items-center overflow-hidden !py-0 ${
          centered ? "justify-center" : ""
        }`}
      >
        <span
          className={`min-w-0 truncate text-base font-semibold tabular-nums ${
            centered ? "px-2 text-center text-lg" : "flex-1"
          }`}
          dir="ltr"
        >
          {value || "—"}
        </span>
        <input
          type={type}
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          aria-label={label || (type === "month" ? "Month" : "Date")}
        />
      </span>
    </label>
  );
}
