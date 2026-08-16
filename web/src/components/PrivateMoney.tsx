"use client";

import { Money } from "@/components/Money";
import type { MoneySign } from "@/lib/api";

type Props = {
  amount: number;
  currency: string;
  locale: "ar" | "en";
  visible: boolean;
  extraSign?: MoneySign;
  className?: string;
  placeholder?: string;
};

/** Shows money or a masked placeholder when privacy is on. */
export function PrivateMoney({
  amount,
  currency,
  locale,
  visible,
  extraSign,
  className = "",
  placeholder = "••••",
}: Props) {
  if (!visible) {
    return (
      <span className={className} aria-hidden>
        {placeholder}
      </span>
    );
  }
  return (
    <Money
      amount={amount}
      currency={currency}
      locale={locale}
      extraSign={extraSign}
      className={className}
    />
  );
}
