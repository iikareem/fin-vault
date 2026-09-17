export const CURRENCY_OPTIONS = [
  { code: "EGP", labelAr: "جنيه مصري", labelEn: "Egyptian pound" },
  { code: "SAR", labelAr: "ريال سعودي", labelEn: "Saudi riyal" },
  { code: "USD", labelAr: "دولار أمريكي", labelEn: "US dollar" },
  { code: "LYD", labelAr: "دينار ليبي", labelEn: "Libyan dinar" },
  { code: "AED", labelAr: "درهم إماراتي", labelEn: "UAE dirham" },
  { code: "EUR", labelAr: "يورو", labelEn: "Euro" },
  { code: "GBP", labelAr: "جنيه إسترليني", labelEn: "British pound" },
  { code: "KWD", labelAr: "دينار كويتي", labelEn: "Kuwaiti dinar" },
  { code: "QAR", labelAr: "ريال قطري", labelEn: "Qatari riyal" },
  { code: "BHD", labelAr: "دينار بحريني", labelEn: "Bahraini dinar" },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];
