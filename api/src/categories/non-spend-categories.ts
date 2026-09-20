/**
 * Categories that move (or leave) wallet cash but are not real spending.
 * Still appear in history; excluded from spend totals / charts.
 */
export const NON_SPEND_CATEGORY_NAMES = [
  'Wallet transfer',
  'Cash withdrawal',
] as const;

export const nonSpendCategoryFilter = {
  name: { notIn: [...NON_SPEND_CATEGORY_NAMES] },
};
