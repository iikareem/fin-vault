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

/** Personal spending groups. Children reference their group by `group` name. */
type ExpenseDef = {
  name: string;
  color: string;
  group?: string;
};

export const PERSONAL_EXPENSE: ExpenseDef[] = [
  // Main groups and standalone categories, in display order.
  { name: 'Nutrition', color: '#16a34a' },
  { name: 'Consumables', color: '#65a30d', group: 'Nutrition' },
  { name: 'Supermarket', color: '#22c55e', group: 'Nutrition' },
  { name: 'Snacks', color: '#d6a35c', group: 'Nutrition' },

  { name: 'Hygiene', color: '#2dd4bf' },
  { name: 'Cleaning', color: '#0ea5e9', group: 'Hygiene' },

  { name: 'Bills', color: '#ea580c' },
  { name: 'Electricity', color: '#facc15', group: 'Bills' },
  { name: 'Water', color: '#38bdf8', group: 'Bills' },
  { name: 'Gas', color: '#fb923c', group: 'Bills' },
  { name: 'Phone bills', color: '#0ea5e9', group: 'Bills' },
  { name: 'Internet', color: '#0891b2', group: 'Bills' },
  { name: 'Other bills', color: '#a8a29e', group: 'Bills' },

  { name: 'Home expenses', color: '#a16207' },
  { name: 'Home decor', color: '#f59e0b', group: 'Home expenses' },
  { name: 'Facility maintenance', color: '#78716c', group: 'Home expenses' },
  { name: 'Appliance repair', color: '#57534e', group: 'Home expenses' },
  { name: 'Repairs & fixes', color: '#78716c', group: 'Home expenses' },
  { name: 'Other home', color: '#a8a29e', group: 'Home expenses' },

  { name: 'Transport', color: '#0284c7' },
  { name: 'Fuel', color: '#0369a1', group: 'Transport' },
  { name: 'Car maintenance', color: '#0e7490', group: 'Transport' },
  { name: 'Other transport', color: '#a8a29e', group: 'Transport' },

  { name: 'Clothes & shoes', color: '#7c3aed' },

  { name: 'Durable purchases', color: '#059669' },
  { name: 'Lamps', color: '#fde047', group: 'Durable purchases' },
  { name: 'Electrical appliances', color: '#64748b', group: 'Durable purchases' },
  { name: 'Electronics', color: '#475569', group: 'Durable purchases' },
  { name: 'Furniture', color: '#d97706', group: 'Durable purchases' },
  { name: 'Other durables', color: '#a8a29e', group: 'Durable purchases' },

  { name: 'Health', color: '#db2777' },
  { name: 'Doctor visit', color: '#f472b6', group: 'Health' },
  { name: 'Medicines', color: '#be185d', group: 'Health' },
  { name: 'Pharmacy', color: '#f43f5e', group: 'Health' },
  { name: 'Lab tests', color: '#e879f9', group: 'Health' },
  { name: 'Other health', color: '#a8a29e', group: 'Health' },

  { name: 'Personal care', color: '#ec4899' },
  { name: 'Beauty', color: '#d946ef', group: 'Personal care' },
  { name: 'Haircut', color: '#c026d3', group: 'Personal care' },
  { name: 'Other care', color: '#a8a29e', group: 'Personal care' },

  { name: 'Social occasions', color: '#e11d48' },
  { name: 'Charity & sadaqah', color: '#0f766e' },

  { name: 'Government fees', color: '#0891b2' },
  { name: 'Licenses', color: '#65a30d', group: 'Government fees' },
  { name: 'Traffic fines', color: '#ef4444', group: 'Government fees' },

  { name: 'Dining & cafés', color: '#f97316' },
  { name: 'Entertainment', color: '#c026d3' },
  { name: 'Sports', color: '#059669' },
  { name: 'Subscriptions', color: '#4f46e5' },
  { name: 'Rent', color: '#7c3aed' },
  { name: 'Education', color: '#2563eb' },

  { name: 'Travel & trips', color: '#0d9488' },
  { name: 'Travel tickets', color: '#2dd4bf', group: 'Travel & trips' },
  { name: 'Travel procedures', color: '#14b8a6', group: 'Travel & trips' },
  { name: 'Local trips', color: '#5eead4', group: 'Travel & trips' },
  { name: 'Summer resort', color: '#0f766e', group: 'Travel & trips' },
  { name: 'Other travel', color: '#a8a29e', group: 'Travel & trips' },

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
      ...incomeCats.map((c) => ({ householdId: personal.id, ...c })),
      ...parents.map((c, i) => ({
        householdId: personal.id,
        name: c.name,
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
