/** System / legacy categories kept for logs but not offered when picking spend. */
export const HIDDEN_EXPENSE_CATEGORIES = new Set([
  "Member payback",
  "Given to member",
  "Allowance",
  "Wallet transfer",
  /** Owned by سلفة section — picker only shows رد سلفة (Loan repayment). */
  "Outside loan",
  "Loan repaid",
  "Debts",
  "Debt repayment",
  "Other debts",
  "Personal loan",
]);

export const HIDDEN_INCOME_CATEGORIES = new Set([
  "Wallet transfer",
  "Loan collected",
  "Loan received",
]);
