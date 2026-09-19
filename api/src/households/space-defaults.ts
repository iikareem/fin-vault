import { Prisma, PrismaClient } from '@prisma/client';
import { nameArFor } from '../categories/category-labels';

type Db = Prisma.TransactionClient | PrismaClient;

const HOUSE_EXPENSE = [
  { name: 'Groceries', color: '#16a34a' },
  { name: 'Rent', color: '#7c3aed' },
  { name: 'Bills', color: '#ea580c' },
  { name: 'Transport', color: '#0284c7' },
  { name: 'Health', color: '#db2777' },
  { name: 'Family gift', color: '#db2777' },
  { name: 'Courtesy', color: '#c026d3' },
  { name: 'Charity', color: '#0f766e' },
  { name: 'Other', color: '#64748b' },
  { name: 'Member payback', color: '#44403c' },
];

/** Personal spending groups. Children reference their group by `group` name. */
type ExpenseDef = {
  name: string;
  color: string;
  group?: string;
};

/**
 * Personal expense tree — parents first, children via `group`.
 * Keep names stable when possible; sync in CategoriesService migrates old rows.
 */
export const PERSONAL_EXPENSE: ExpenseDef[] = [
  // Food & drink
  { name: 'Food', color: '#16a34a' },
  { name: 'Home food', color: '#65a30d', group: 'Food' },
  { name: 'Dining & cafés', color: '#f97316', group: 'Food' },
  { name: 'Supermarket food', color: '#4ade80', group: 'Food' },
  { name: 'Other food', color: '#a8a29e', group: 'Food' },

  // Non-food supermarket / household supplies
  { name: 'Supermarket', color: '#22c55e' },
  { name: 'Supermarket cleaning', color: '#0ea5e9', group: 'Supermarket' },
  { name: 'Supermarket household', color: '#a16207', group: 'Supermarket' },
  { name: 'Other supermarket', color: '#a8a29e', group: 'Supermarket' },

  // Bills & utilities
  { name: 'Bills', color: '#ea580c' },
  { name: 'Electricity', color: '#facc15', group: 'Bills' },
  { name: 'Water', color: '#38bdf8', group: 'Bills' },
  { name: 'Gas', color: '#fb923c', group: 'Bills' },
  { name: 'Phone bills', color: '#0ea5e9', group: 'Bills' },
  { name: 'Internet', color: '#0891b2', group: 'Bills' },
  { name: 'Other bills', color: '#a8a29e', group: 'Bills' },

  // Housing & home
  { name: 'Housing', color: '#a16207' },
  { name: 'Rent', color: '#7c3aed', group: 'Housing' },
  { name: 'Insurance', color: '#0369a1', group: 'Housing' },
  { name: 'Home decor', color: '#f59e0b', group: 'Housing' },
  { name: 'Facility maintenance', color: '#78716c', group: 'Housing' },
  { name: 'Appliance repair', color: '#57534e', group: 'Housing' },
  { name: 'Repairs & fixes', color: '#78716c', group: 'Housing' },
  { name: 'Other home', color: '#a8a29e', group: 'Housing' },

  // Transport
  { name: 'Transport', color: '#0284c7' },
  { name: 'Fuel', color: '#0369a1', group: 'Transport' },
  { name: 'Car maintenance', color: '#0e7490', group: 'Transport' },
  { name: 'Car installments', color: '#6d28d9', group: 'Transport' },
  { name: 'Rides', color: '#38bdf8', group: 'Transport' },
  { name: 'Other transport', color: '#a8a29e', group: 'Transport' },

  // Shopping & durables
  { name: 'Shopping', color: '#059669' },
  { name: 'Clothes & shoes', color: '#7c3aed', group: 'Shopping' },
  { name: 'Electronics', color: '#475569', group: 'Shopping' },
  { name: 'Electrical appliances', color: '#64748b', group: 'Shopping' },
  { name: 'Furniture', color: '#d97706', group: 'Shopping' },
  { name: 'Lamps', color: '#fde047', group: 'Shopping' },
  { name: 'Other shopping', color: '#a8a29e', group: 'Shopping' },

  // Health
  { name: 'Health', color: '#db2777' },
  { name: 'Doctor visit', color: '#f472b6', group: 'Health' },
  { name: 'Medicines', color: '#be185d', group: 'Health' },
  { name: 'Pharmacy', color: '#f43f5e', group: 'Health' },
  { name: 'Lab tests', color: '#e879f9', group: 'Health' },
  { name: 'Other health', color: '#a8a29e', group: 'Health' },

  // Personal care & hygiene
  { name: 'Personal care', color: '#ec4899' },
  { name: 'Beauty', color: '#d946ef', group: 'Personal care' },
  { name: 'Haircut', color: '#c026d3', group: 'Personal care' },
  { name: 'Cleaning', color: '#0ea5e9', group: 'Personal care' },
  { name: 'Other care', color: '#a8a29e', group: 'Personal care' },

  // Family
  { name: 'Family', color: '#f59e0b' },
  { name: 'Pocket money', color: '#fbbf24', group: 'Family' },
  { name: 'School needs', color: '#d97706', group: 'Family' },
  { name: 'Education', color: '#2563eb', group: 'Family' },
  { name: 'Family support', color: '#be185d', group: 'Family' },
  { name: 'Social occasions', color: '#e11d48', group: 'Family' },
  { name: 'Other family', color: '#a8a29e', group: 'Family' },

  // Lifestyle
  { name: 'Lifestyle', color: '#c026d3' },
  { name: 'Entertainment', color: '#a855f7', group: 'Lifestyle' },
  { name: 'Sports', color: '#059669', group: 'Lifestyle' },
  { name: 'Subscriptions', color: '#4f46e5', group: 'Lifestyle' },
  { name: 'Other lifestyle', color: '#a8a29e', group: 'Lifestyle' },

  // Travel
  { name: 'Travel & trips', color: '#0d9488' },
  { name: 'Travel tickets', color: '#2dd4bf', group: 'Travel & trips' },
  { name: 'Travel procedures', color: '#14b8a6', group: 'Travel & trips' },
  { name: 'Local trips', color: '#5eead4', group: 'Travel & trips' },
  { name: 'Summer resort', color: '#0f766e', group: 'Travel & trips' },
  { name: 'Other travel', color: '#a8a29e', group: 'Travel & trips' },

  // Charity
  { name: 'Charity & sadaqah', color: '#0f766e' },
  { name: 'Mosque', color: '#0f766e', group: 'Charity & sadaqah' },
  { name: 'Ongoing sadaqah', color: '#15803d', group: 'Charity & sadaqah' },
  { name: 'Zakat', color: '#b45309', group: 'Charity & sadaqah' },
  { name: 'Sadaqah', color: '#0f766e', group: 'Charity & sadaqah' },
  { name: 'Help someone', color: '#0369a1', group: 'Charity & sadaqah' },
  { name: 'Other charity', color: '#a8a29e', group: 'Charity & sadaqah' },

  // رد سلفة — alone (no Debts group)
  { name: 'Loan repayment', color: '#dc2626' },

  // Installments (non-car)
  { name: 'Installments', color: '#9333ea' },
  { name: 'Apartment installments', color: '#7c3aed', group: 'Installments' },
  { name: 'Other installments', color: '#a8a29e', group: 'Installments' },

  // Government
  { name: 'Government fees', color: '#0891b2' },
  { name: 'Licenses', color: '#65a30d', group: 'Government fees' },
  { name: 'Traffic fines', color: '#ef4444', group: 'Government fees' },
  { name: 'Other government', color: '#a8a29e', group: 'Government fees' },

  // Trousseau
  { name: "Daughters' trousseau", color: '#be123c' },
  { name: 'Kitchen supplies', color: '#fb7185', group: "Daughters' trousseau" },
  { name: 'Kitchen appliances', color: '#f43f5e', group: "Daughters' trousseau" },
  { name: 'Curtains & furnishings', color: '#e11d48', group: "Daughters' trousseau" },
  { name: 'Flooring', color: '#b45309', group: "Daughters' trousseau" },
  { name: 'Trousseau clothes', color: '#ec4899', group: "Daughters' trousseau" },
  { name: 'Trousseau furniture', color: '#d97706', group: "Daughters' trousseau" },
  { name: 'Other trousseau', color: '#a8a29e', group: "Daughters' trousseau" },

  { name: 'Other', color: '#64748b' },
];

export async function seedPersonalSpace(
  client: Db,
  userId: string,
  name: string,
) {
  const personal = await client.household.create({
    data: { name: `فلوس ${name}`, kind: 'PERSONAL', currency: 'EGP' },
  });
  await client.membership.create({
    data: { userId, householdId: personal.id, role: 'ADMIN' },
  });
  await client.account.create({
    data: { householdId: personal.id, name: 'Current', type: 'CASH' },
  });
  await client.account.create({
    data: { householdId: personal.id, name: 'Savings', type: 'CASH' },
  });
  const incomeCats: { name: string; kind: 'INCOME'; color: string }[] = [
    { name: 'Salary', kind: 'INCOME', color: '#15803d' },
    { name: 'Other income', kind: 'INCOME', color: '#0f766e' },
    { name: 'From the house', kind: 'INCOME', color: '#0f766e' },
    { name: 'Allowance', kind: 'INCOME', color: '#0284c7' },
    { name: 'Family gift', kind: 'INCOME', color: '#db2777' },
  ];
  const parents = PERSONAL_EXPENSE.filter((c) => !c.group);
  const children = PERSONAL_EXPENSE.filter((c) => c.group);

  await client.category.createMany({
    data: [
      ...incomeCats.map((c) => ({
        householdId: personal.id,
        ...c,
        nameAr: nameArFor(c.name),
      })),
      ...parents.map((c, i) => ({
        householdId: personal.id,
        name: c.name,
        nameAr: nameArFor(c.name),
        kind: 'EXPENSE' as const,
        color: c.color,
        sortOrder: i,
      })),
    ],
  });
  for (const child of children) {
    const parent = await client.category.findFirst({
      where: { householdId: personal.id, kind: 'EXPENSE', name: child.group },
    });
    if (!parent) continue;
    await client.category.create({
      data: {
        householdId: personal.id,
        name: child.name,
        nameAr: nameArFor(child.name),
        kind: 'EXPENSE',
        color: child.color,
        parentId: parent.id,
      },
    });
  }
  return personal;
}

export async function seedHouseBooks(client: Db, householdId: string) {
  await client.account.createMany({
    data: [
      { householdId, name: 'Current', type: 'CASH' },
      { householdId, name: 'Savings', type: 'CASH' },
    ],
  });
  await client.category.createMany({
    data: [
      ...HOUSE_EXPENSE.map((c) => ({
        householdId,
        name: c.name,
        nameAr: nameArFor(c.name),
        kind: 'EXPENSE' as const,
        color: c.color,
      })),
      {
        householdId,
        name: 'Allowance',
        nameAr: nameArFor('Allowance'),
        kind: 'EXPENSE' as const,
        color: '#0284c7',
      },
      {
        householdId,
        name: 'Salary',
        nameAr: nameArFor('Salary'),
        kind: 'INCOME',
        color: '#15803d',
      },
      {
        householdId,
        name: 'Other income',
        nameAr: nameArFor('Other income'),
        kind: 'INCOME',
        color: '#0f766e',
      },
      {
        householdId,
        name: 'Personal loan',
        nameAr: nameArFor('Personal loan'),
        kind: 'PEER',
        color: '#57534e',
      },
      {
        householdId,
        name: 'Help with a bill',
        nameAr: nameArFor('Help with a bill'),
        kind: 'PEER',
        color: '#a16207',
      },
    ],
  });
  await client.charityType.createMany({
    data: [
      { householdId, name: 'Mosque', color: '#0f766e' },
      { householdId, name: 'Zakat', color: '#b45309' },
      { householdId, name: 'Help someone', color: '#0369a1' },
    ],
  });
}
