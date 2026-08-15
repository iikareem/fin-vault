export type WalletAccount = { id: string; name: string; type?: string; balance?: number };

export function isCashWallet(a: { type?: string; name: string }) {
  if (a.type === "BANK") return false;
  return (
    a.type === "CASH" ||
    a.name === "Cash" ||
    a.name === "Current" ||
    a.name === "Savings"
  );
}

export function isCurrentWallet(a: { name: string }) {
  return a.name === "Current" || a.name === "Cash";
}

export function isSavingsWallet(a: { name: string }) {
  return a.name === "Savings";
}

export function sortCashWallets<T extends { name: string }>(accounts: T[]) {
  return [...accounts].sort((a, b) => {
    const rank = (x: { name: string }) =>
      isCurrentWallet(x) ? 0 : isSavingsWallet(x) ? 1 : 2;
    return rank(a) - rank(b);
  });
}
