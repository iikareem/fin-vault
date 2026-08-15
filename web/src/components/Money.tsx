import { moneyParts, type MoneySign } from "@/lib/api";

type Props = {
  amount: number;
  currency?: string;
  locale: "ar" | "en";
  extraSign?: MoneySign;
  className?: string;
};

export function Money({
  amount,
  currency = "EGP",
  locale,
  extraSign,
  className = "",
}: Props) {
  const { n, sign, symbol } = moneyParts(amount, currency, locale, extraSign);
  if (locale !== "ar") {
    return (
      <span dir="ltr" className={className}>
        {sign}
        {n} {symbol}
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-row items-baseline gap-1 ${className}`}>
      <span dir="rtl">{symbol}</span>
      <bdo dir="ltr">
        {n}
        {sign}
      </bdo>
    </span>
  );
}
