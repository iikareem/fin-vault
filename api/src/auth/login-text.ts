export function normalizeLoginEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeLoginPassword(value: string) {
  return value
    .trim()
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, "-");
}
