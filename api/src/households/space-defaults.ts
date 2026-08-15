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
      { householdId: personal.id, name: 'Other', kind: 'EXPENSE', color: '#64748b' },
      { householdId: personal.id, name: 'Charity', kind: 'EXPENSE', color: '#0f766e' },
      { householdId: personal.id, name: 'From the house', kind: 'INCOME', color: '#0f766e' },
      { householdId: personal.id, name: 'Allowance', kind: 'INCOME', color: '#0284c7' },
      { householdId: personal.id, name: 'Family gift', kind: 'INCOME', color: '#db2777' },
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
