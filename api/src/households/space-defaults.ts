import { Prisma, PrismaClient } from '@prisma/client';

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

/** Personal spending types. Groceries shows as مشتريات and is the UI default. */
export const PERSONAL_EXPENSE = [
  { name: 'Groceries', color: '#16a34a' },
  { name: 'Food', color: '#e11d48' },
  { name: 'Restaurants', color: '#f97316' },
  { name: 'Coffee', color: '#92400e' },
  { name: 'Clothes', color: '#7c3aed' },
  { name: 'Shoes', color: '#6d28d9' },
  { name: 'Transport', color: '#0284c7' },
  { name: 'Fuel', color: '#0369a1' },
  { name: 'Bills', color: '#ea580c' },
  { name: 'Phone', color: '#0ea5e9' },
  { name: 'Internet', color: '#0891b2' },
  { name: 'Subscriptions', color: '#4f46e5' },
  { name: 'Rent', color: '#7c3aed' },
  { name: 'Health', color: '#db2777' },
  { name: 'Pharmacy', color: '#be185d' },
  { name: 'Personal care', color: '#ec4899' },
  { name: 'Beauty', color: '#d946ef' },
  { name: 'Education', color: '#2563eb' },
  { name: 'Entertainment', color: '#c026d3' },
  { name: 'Sports', color: '#059669' },
  { name: 'Travel', color: '#0d9488' },
  { name: 'Gifts', color: '#e11d48' },
  { name: 'Electronics', color: '#475569' },
  { name: 'Home', color: '#a16207' },
  { name: 'Pets', color: '#ca8a04' },
  { name: 'Charity', color: '#0f766e' },
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
  await client.category.createMany({
    data: [
      { householdId: personal.id, name: 'Salary', kind: 'INCOME', color: '#15803d' },
      { householdId: personal.id, name: 'Other income', kind: 'INCOME', color: '#0f766e' },
      { householdId: personal.id, name: 'From the house', kind: 'INCOME', color: '#0f766e' },
      { householdId: personal.id, name: 'Allowance', kind: 'INCOME', color: '#0284c7' },
      { householdId: personal.id, name: 'Family gift', kind: 'INCOME', color: '#db2777' },
      ...PERSONAL_EXPENSE.map((c) => ({
        householdId: personal.id,
        name: c.name,
        kind: 'EXPENSE' as const,
        color: c.color,
      })),
    ],
  });
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
        kind: 'EXPENSE' as const,
        color: c.color,
      })),
      {
        householdId,
        name: 'Allowance',
        kind: 'EXPENSE' as const,
        color: '#0284c7',
      },
      { householdId, name: 'Salary', kind: 'INCOME', color: '#15803d' },
      { householdId, name: 'Other income', kind: 'INCOME', color: '#0f766e' },
      { householdId, name: 'Personal loan', kind: 'PEER', color: '#57534e' },
      { householdId, name: 'Help with a bill', kind: 'PEER', color: '#a16207' },
    ],
  });
  await client.charityType.createMany({
    data: [{ householdId, name: 'Mosque', color: '#0f766e' }],
  });
}
