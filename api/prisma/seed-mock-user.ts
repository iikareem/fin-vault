/**
 * Idempotent demo seeder for a rich mock_user account.
 *
 * Usage:
 *   DATABASE_URL='postgresql://…' npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-mock-user.ts
 *
 * Login: mock_user@demo.local / Mock-Vault-26
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedPersonalSpace } from '../src/households/space-defaults';

const prisma = new PrismaClient();

const EMAIL = 'mock_user@demo.local';
const PASSWORD = 'Mock-Vault-26';
const NAME = 'Mock User';
const RELATION = 'Demo';
const DEMO = '[demo]';

function d(daysAgo: number) {
  const x = new Date();
  x.setUTCHours(12, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - daysAgo);
  return x;
}

function iso(daysAgo: number) {
  return d(daysAgo).toISOString().slice(0, 10);
}

async function cat(
  householdId: string,
  name: string,
  kind: 'EXPENSE' | 'INCOME' | 'PEER',
) {
  const row = await prisma.category.findFirst({
    where: { householdId, name, kind },
  });
  if (!row) throw new Error(`Missing category ${kind}/${name} in ${householdId}`);
  return row;
}

async function ensureCat(
  householdId: string,
  name: string,
  kind: 'EXPENSE' | 'INCOME',
  color: string,
) {
  const existing = await prisma.category.findFirst({
    where: { householdId, name, kind },
  });
  if (existing) return existing;
  return prisma.category.create({
    data: { householdId, name, kind, color },
  });
}

async function wallet(householdId: string, name: 'Current' | 'Savings') {
  const row = await prisma.account.findFirst({
    where: { householdId, name, archived: false },
  });
  if (!row) throw new Error(`Missing wallet ${name}`);
  return row;
}

async function wipeDemo(userId: string, personalId: string, houseId: string) {
  // Goals / gold owned by user
  await prisma.savingsGoal.deleteMany({ where: { userId } });
  await prisma.goldHolding.deleteMany({ where: { userId } });

  // Outside loans (+ collections via cascade / txs)
  const outside = await prisma.outsideLoan.findMany({
    where: { userId },
    include: { collections: true },
  });
  for (const loan of outside) {
    for (const c of loan.collections) {
      await prisma.outsideLoanCollection.delete({ where: { id: c.id } });
      await prisma.transaction.delete({ where: { id: c.collectTxId } }).catch(() => undefined);
    }
    await prisma.outsideLoan.delete({ where: { id: loan.id } });
    await prisma.transaction.delete({ where: { id: loan.lendTxId } }).catch(() => undefined);
  }

  // Peer loans involving mock user on house
  const peer = await prisma.peerLoan.findMany({
    where: {
      householdId: houseId,
      OR: [{ fromUserId: userId }, { toUserId: userId }],
      note: { startsWith: DEMO },
    },
    include: { repayments: true },
  });
  for (const loan of peer) {
    for (const r of loan.repayments) {
      await prisma.loanRepayment.delete({ where: { id: r.id } });
      if (r.fromPersonalTxId) {
        await prisma.transaction.delete({ where: { id: r.fromPersonalTxId } }).catch(() => undefined);
      }
      if (r.toPersonalTxId) {
        await prisma.transaction.delete({ where: { id: r.toPersonalTxId } }).catch(() => undefined);
      }
    }
    await prisma.peerLoan.delete({ where: { id: loan.id } });
    if (loan.fromPersonalTxId) {
      await prisma.transaction.delete({ where: { id: loan.fromPersonalTxId } }).catch(() => undefined);
    }
    if (loan.toPersonalTxId) {
      await prisma.transaction.delete({ where: { id: loan.toPersonalTxId } }).catch(() => undefined);
    }
  }

  // Claims / covers / charity by mock
  const claims = await prisma.houseClaim.findMany({
    where: { memberId: userId, note: { startsWith: DEMO } },
    include: { reimbursements: true },
  });
  for (const c of claims) {
    for (const r of c.reimbursements) {
      await prisma.reimbursement.delete({ where: { id: r.id } });
      if (r.transactionId) {
        await prisma.transaction.delete({ where: { id: r.transactionId } }).catch(() => undefined);
      }
      if (r.personalTxId) {
        await prisma.transaction.delete({ where: { id: r.personalTxId } }).catch(() => undefined);
      }
    }
    await prisma.houseClaim.delete({ where: { id: c.id } });
    if (c.personalTxId) {
      await prisma.transaction.delete({ where: { id: c.personalTxId } }).catch(() => undefined);
    }
  }

  const covers = await prisma.houseCover.findMany({
    where: { memberId: userId, note: { startsWith: DEMO } },
    include: { repayments: true },
  });
  for (const c of covers) {
    for (const r of c.repayments) {
      await prisma.coverRepayment.delete({ where: { id: r.id } });
      if (r.houseTxId) {
        await prisma.transaction.delete({ where: { id: r.houseTxId } }).catch(() => undefined);
      }
      if (r.personalTxId) {
        await prisma.transaction.delete({ where: { id: r.personalTxId } }).catch(() => undefined);
      }
    }
    await prisma.houseCover.delete({ where: { id: c.id } });
    await prisma.transaction.delete({ where: { id: c.houseTxId } }).catch(() => undefined);
  }

  const gifts = await prisma.charityGift.findMany({
    where: { memberId: userId, note: { startsWith: DEMO } },
  });
  for (const g of gifts) {
    await prisma.charityGift.delete({ where: { id: g.id } });
    if (g.personalTxId) {
      await prisma.transaction.delete({ where: { id: g.personalTxId } }).catch(() => undefined);
    }
    if (g.houseTxId) {
      await prisma.transaction.delete({ where: { id: g.houseTxId } }).catch(() => undefined);
    }
  }

  // Remaining demo-tagged txs on personal + house by this user
  await prisma.transaction.deleteMany({
    where: {
      userId,
      note: { startsWith: DEMO },
      OR: [{ householdId: personalId }, { householdId: houseId }],
    },
  });
}

async function main() {
  const house = await prisma.household.findFirst({ where: { kind: 'HOUSE' } });
  if (!house) throw new Error('No HOUSE household found — seed the family first');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: NAME,
        email: EMAIL,
        passwordHash,
        relation: RELATION,
        preferredCurrency: 'EGP',
        theme: 'dark',
      },
    });
    console.log('Created user', EMAIL);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: NAME,
        passwordHash,
        relation: RELATION,
        preferredCurrency: 'EGP',
        theme: 'dark',
      },
    });
    console.log('Updated user', EMAIL);
  }
  if (!user) throw new Error('Failed to load mock user');
  const userId = user.id;

  let personalMembership = await prisma.membership.findFirst({
    where: { userId, household: { kind: 'PERSONAL' } },
    include: { household: true },
  });
  if (!personalMembership) {
    const personal = await seedPersonalSpace(prisma, userId, NAME);
    personalMembership = await prisma.membership.findFirstOrThrow({
      where: { userId, householdId: personal.id },
      include: { household: true },
    });
    console.log('Created personal space');
  } else {
    await prisma.household.update({
      where: { id: personalMembership.householdId },
      data: { name: `فلوس ${NAME}` },
    });
  }
  const personalId = personalMembership.householdId;

  const houseMem = await prisma.membership.findFirst({
    where: { userId, householdId: house.id },
  });
  if (!houseMem) {
    await prisma.membership.create({
      data: { userId, householdId: house.id, role: 'MEMBER' },
    });
    console.log('Joined house as MEMBER');
  }

  await wipeDemo(userId, personalId, house.id);
  console.log('Cleared previous demo rows');

  const pCurrent = await wallet(personalId, 'Current');
  const pSavings = await wallet(personalId, 'Savings');
  const hCurrent = await wallet(house.id, 'Current');

  const salary = await cat(personalId, 'Salary', 'INCOME');
  const otherIncome = await cat(personalId, 'Other income', 'INCOME');
  const fromHouse = await cat(personalId, 'From the house', 'INCOME');
  const allowance = await cat(personalId, 'Allowance', 'INCOME');
  const familyGiftIn = await cat(personalId, 'Family gift', 'INCOME');

  const dining = await cat(personalId, 'Dining & cafés', 'EXPENSE');
  const homeFood = await cat(personalId, 'Home food', 'EXPENSE');
  const fuel = await cat(personalId, 'Fuel', 'EXPENSE');
  const rides = await cat(personalId, 'Rides', 'EXPENSE');
  const carMaint = await cat(personalId, 'Car maintenance', 'EXPENSE');
  const clothes = await cat(personalId, 'Clothes & shoes', 'EXPENSE');
  const electronics = await cat(personalId, 'Electronics', 'EXPENSE');
  const phone = await cat(personalId, 'Phone bills', 'EXPENSE');
  const internet = await cat(personalId, 'Internet', 'EXPENSE');
  const electricity = await cat(personalId, 'Electricity', 'EXPENSE');
  const supermarket = await cat(personalId, 'Supermarket food', 'EXPENSE');
  const cleaning = await cat(personalId, 'Supermarket cleaning', 'EXPENSE');
  const entertainment = await cat(personalId, 'Entertainment', 'EXPENSE');
  const sports = await cat(personalId, 'Sports', 'EXPENSE');
  const subs = await cat(personalId, 'Subscriptions', 'EXPENSE');
  const doctor = await cat(personalId, 'Doctor visit', 'EXPENSE');
  const pharmacy = await cat(personalId, 'Pharmacy', 'EXPENSE');
  const haircut = await cat(personalId, 'Haircut', 'EXPENSE');
  const travelTickets = await cat(personalId, 'Travel tickets', 'EXPENSE');
  const localTrips = await cat(personalId, 'Local trips', 'EXPENSE');
  const sadaqah = await cat(personalId, 'Sadaqah', 'EXPENSE');
  const zakat = await cat(personalId, 'Zakat', 'EXPENSE');
  const mosque = await cat(personalId, 'Mosque', 'EXPENSE');
  const familySupport = await cat(personalId, 'Family support', 'EXPENSE');
  const pocketMoney = await cat(personalId, 'Pocket money', 'EXPENSE');
  const education = await cat(personalId, 'Education', 'EXPENSE');
  const carInstall = await cat(personalId, 'Car installments', 'EXPENSE');
  const aptInstall = await cat(personalId, 'Apartment installments', 'EXPENSE');
  const loanRepay = await cat(personalId, 'Loan repayment', 'EXPENSE');
  const otherExp = await cat(personalId, 'Other', 'EXPENSE');

  const transferExp = await ensureCat(
    personalId,
    'Wallet transfer',
    'EXPENSE',
    '#57534e',
  );
  const transferInc = await ensureCat(
    personalId,
    'Wallet transfer',
    'INCOME',
    '#57534e',
  );
  const outsideLendCat = await ensureCat(
    personalId,
    'Outside loan',
    'EXPENSE',
    '#b91c1c',
  );
  const outsideCollectCat = await ensureCat(
    personalId,
    'Loan collected',
    'INCOME',
    '#15803d',
  );
  const outsideBorrowCat = await ensureCat(
    personalId,
    'Loan received',
    'INCOME',
    '#0369a1',
  );
  const outsideRepayCat = await ensureCat(
    personalId,
    'Loan repaid',
    'EXPENSE',
    '#c2410c',
  );

  const tx = (
    accountId: string,
    categoryId: string,
    type: 'INCOME' | 'EXPENSE' | 'TRACK',
    amount: number,
    daysAgo: number,
    note: string,
  ): Prisma.TransactionCreateManyInput => ({
    householdId: personalId,
    userId,
    accountId,
    categoryId,
    type,
    amount,
    occurredOn: d(daysAgo),
    note: `${DEMO} ${note}`,
  });

  // ~6 months of personal life: income, bills, lifestyle, transfers, track
  const personalTxs: Prisma.TransactionCreateManyInput[] = [
    // —— Salaries & income (old → recent) ——
    tx(pCurrent.id, salary.id, 'INCOME', 26000, 175, 'راتب سبتمبر'),
    tx(pCurrent.id, salary.id, 'INCOME', 26000, 145, 'راتب أكتوبر'),
    tx(pCurrent.id, salary.id, 'INCOME', 27000, 115, 'راتب نوفمبر'),
    tx(pCurrent.id, salary.id, 'INCOME', 27000, 85, 'راتب ديسمبر'),
    tx(pCurrent.id, salary.id, 'INCOME', 28000, 55, 'راتب يناير'),
    tx(pCurrent.id, salary.id, 'INCOME', 28000, 25, 'راتب فبراير'),
    tx(pCurrent.id, otherIncome.id, 'INCOME', 5000, 160, 'مشروع جانبي'),
    tx(pCurrent.id, otherIncome.id, 'INCOME', 3500, 40, 'بونص'),
    tx(pCurrent.id, fromHouse.id, 'INCOME', 2000, 70, 'من البيت'),
    tx(pCurrent.id, allowance.id, 'INCOME', 1500, 95, 'مصروف'),
    tx(pCurrent.id, familyGiftIn.id, 'INCOME', 1000, 130, 'هدية عيلة'),

    // —— Recurring bills ——
    tx(pCurrent.id, phone.id, 'EXPENSE', 320, 168, 'موبايل قديم'),
    tx(pCurrent.id, phone.id, 'EXPENSE', 330, 138, 'موبايل'),
    tx(pCurrent.id, phone.id, 'EXPENSE', 340, 108, 'موبايل'),
    tx(pCurrent.id, phone.id, 'EXPENSE', 350, 78, 'موبايل'),
    tx(pCurrent.id, phone.id, 'EXPENSE', 350, 48, 'موبايل'),
    tx(pCurrent.id, phone.id, 'EXPENSE', 350, 12, 'موبايل'),
    tx(pCurrent.id, internet.id, 'EXPENSE', 450, 165, 'نت'),
    tx(pCurrent.id, internet.id, 'EXPENSE', 450, 100, 'نت'),
    tx(pCurrent.id, internet.id, 'EXPENSE', 480, 35, 'نت'),
    tx(pCurrent.id, electricity.id, 'EXPENSE', 680, 150, 'كهربا'),
    tx(pCurrent.id, electricity.id, 'EXPENSE', 720, 60, 'كهربا'),
    tx(pCurrent.id, electricity.id, 'EXPENSE', 690, 15, 'كهربا'),
    tx(pCurrent.id, subs.id, 'EXPENSE', 299, 155, 'نتفلكس'),
    tx(pCurrent.id, subs.id, 'EXPENSE', 299, 90, 'نتفلكس'),
    tx(pCurrent.id, subs.id, 'EXPENSE', 299, 9, 'اشتراك'),
    tx(pCurrent.id, carInstall.id, 'EXPENSE', 6500, 140, 'قسط عربية'),
    tx(pCurrent.id, carInstall.id, 'EXPENSE', 6500, 50, 'قسط عربية'),
    tx(pCurrent.id, aptInstall.id, 'EXPENSE', 4000, 120, 'قسط شقة'),
    tx(pCurrent.id, aptInstall.id, 'EXPENSE', 4000, 28, 'قسط شقة'),

    // —— Food & daily ——
    tx(pCurrent.id, supermarket.id, 'EXPENSE', 2100, 170, 'سوبرماركت قديم'),
    tx(pCurrent.id, supermarket.id, 'EXPENSE', 1800, 110, 'سوبرماركت'),
    tx(pCurrent.id, supermarket.id, 'EXPENSE', 1600, 45, 'سوبرماركت'),
    tx(pCurrent.id, supermarket.id, 'EXPENSE', 1450, 2, 'سوبرماركت'),
    tx(pCurrent.id, homeFood.id, 'EXPENSE', 380, 88, 'أكل بيت'),
    tx(pCurrent.id, homeFood.id, 'EXPENSE', 420, 22, 'أكل بيت'),
    tx(pCurrent.id, dining.id, 'EXPENSE', 650, 150, 'مطعم'),
    tx(pCurrent.id, dining.id, 'EXPENSE', 480, 66, 'عشاء'),
    tx(pCurrent.id, dining.id, 'EXPENSE', 420, 3, 'عشاء'),
    tx(pCurrent.id, dining.id, 'EXPENSE', 185, 8, 'قهوة'),
    tx(pCurrent.id, cleaning.id, 'EXPENSE', 240, 38, 'منظفات'),

    // —— Transport ——
    tx(pCurrent.id, fuel.id, 'EXPENSE', 850, 162, 'بنزين'),
    tx(pCurrent.id, fuel.id, 'EXPENSE', 900, 92, 'بنزين'),
    tx(pCurrent.id, fuel.id, 'EXPENSE', 900, 5, 'بنزين'),
    tx(pCurrent.id, rides.id, 'EXPENSE', 120, 44, 'أوبر'),
    tx(pCurrent.id, rides.id, 'EXPENSE', 95, 11, 'أوبر'),
    tx(pCurrent.id, carMaint.id, 'EXPENSE', 1800, 125, 'صيانة عربية'),

    // —— Shopping & lifestyle ——
    tx(pCurrent.id, clothes.id, 'EXPENSE', 3200, 135, 'هدوم شتوي'),
    tx(pCurrent.id, clothes.id, 'EXPENSE', 2200, 18, 'هدوم'),
    tx(pCurrent.id, electronics.id, 'EXPENSE', 5500, 105, 'سماعات'),
    tx(pCurrent.id, entertainment.id, 'EXPENSE', 450, 75, 'سينما'),
    tx(pCurrent.id, sports.id, 'EXPENSE', 800, 98, 'جيم'),
    tx(pCurrent.id, sports.id, 'EXPENSE', 800, 30, 'جيم'),
    tx(pCurrent.id, haircut.id, 'EXPENSE', 150, 52, 'حلاقة'),
    tx(pCurrent.id, haircut.id, 'EXPENSE', 150, 10, 'حلاقة'),

    // —— Health ——
    tx(pCurrent.id, doctor.id, 'EXPENSE', 600, 118, 'كشف'),
    tx(pCurrent.id, pharmacy.id, 'EXPENSE', 280, 117, 'أدوية'),
    tx(pCurrent.id, pharmacy.id, 'EXPENSE', 190, 19, 'صيدلية'),

    // —— Travel ——
    tx(pCurrent.id, travelTickets.id, 'EXPENSE', 8200, 100, 'تذاكر سفر'),
    tx(pCurrent.id, localTrips.id, 'EXPENSE', 1500, 42, 'رحلة قصيرة'),

    // —— Family & charity ——
    tx(pCurrent.id, familySupport.id, 'EXPENSE', 2000, 148, 'مساعدة أهل'),
    tx(pCurrent.id, pocketMoney.id, 'EXPENSE', 500, 33, 'مصروف أولاد'),
    tx(pCurrent.id, education.id, 'EXPENSE', 3500, 80, 'كورس'),
    tx(pCurrent.id, sadaqah.id, 'EXPENSE', 200, 160, 'صدقة'),
    tx(pCurrent.id, sadaqah.id, 'EXPENSE', 200, 80, 'صدقة'),
    tx(pCurrent.id, sadaqah.id, 'EXPENSE', 200, 6, 'صدقة'),
    tx(pCurrent.id, zakat.id, 'EXPENSE', 2500, 95, 'زكاة'),
    tx(pCurrent.id, mosque.id, 'EXPENSE', 100, 27, 'مسجد'),
    tx(pCurrent.id, otherExp.id, 'EXPENSE', 75, 14, 'متفرقات'),

    // —— Track-only (no balance change) ——
    tx(pCurrent.id, dining.id, 'TRACK', 300, 58, 'ضيافة قديمة بدون خصم'),
    tx(pCurrent.id, dining.id, 'TRACK', 150, 1, 'ضيافة من غير خصم'),
    tx(pCurrent.id, entertainment.id, 'TRACK', 200, 21, 'هدية مدفوعة من حد تاني'),

    // —— Transfers Current ↔ Savings over time ——
    tx(pCurrent.id, transferExp.id, 'EXPENSE', 10000, 150, 'تحويل توفير قديم'),
    tx(pSavings.id, transferInc.id, 'INCOME', 10000, 150, 'تحويل توفير قديم'),
    tx(pCurrent.id, transferExp.id, 'EXPENSE', 7000, 100, 'تحويل توفير'),
    tx(pSavings.id, transferInc.id, 'INCOME', 7000, 100, 'تحويل توفير'),
    tx(pCurrent.id, transferExp.id, 'EXPENSE', 8000, 20, 'تحويل للتوفير'),
    tx(pSavings.id, transferInc.id, 'INCOME', 8000, 20, 'تحويل للتوفير'),
    tx(pCurrent.id, transferExp.id, 'EXPENSE', 5000, 10, 'تحويل تاني للتوفير'),
    tx(pSavings.id, transferInc.id, 'INCOME', 5000, 10, 'تحويل تاني للتوفير'),
    // spend from savings once
    tx(pSavings.id, electronics.id, 'EXPENSE', 2500, 65, 'شراء من التوفير'),
  ];
  await prisma.transaction.createMany({ data: personalTxs });

  // Savings goals — mix of early / mid / done
  await prisma.savingsGoal.createMany({
    data: [
      {
        householdId: personalId,
        userId: userId,
        name: 'عربية',
        targetAmount: 200000,
        savedAmount: 28000,
        note: `${DEMO} هدف كبير من شهور`,
        color: '#0f766e',
      },
      {
        householdId: personalId,
        userId: userId,
        name: 'جهاز',
        targetAmount: 45000,
        savedAmount: 12000,
        note: `${DEMO} لابتوب`,
        color: '#0369a1',
      },
      {
        householdId: personalId,
        userId: userId,
        name: 'سفر',
        targetAmount: 15000,
        savedAmount: 15000,
        note: `${DEMO} وصل للهدف — جرّب اشتريتوه`,
        color: '#7c3aed',
      },
      {
        householdId: personalId,
        userId: userId,
        name: 'فرح',
        targetAmount: 80000,
        savedAmount: 5000,
        note: `${DEMO} لسه في الأول`,
        color: '#be123c',
      },
      {
        householdId: personalId,
        userId: userId,
        name: 'عيادة أسنان',
        targetAmount: 8000,
        savedAmount: 6500,
        note: `${DEMO} قريب يخلص`,
        color: '#b45309',
      },
    ],
  });

  // Gold — several pieces across time / karats
  await prisma.goldHolding.createMany({
    data: [
      {
        householdId: personalId,
        userId: userId,
        grams: 12,
        karat: 'K21',
        paidAmount: 52000,
        note: `${DEMO} سلسلة قديمة`,
        acquiredOn: d(200),
      },
      {
        householdId: personalId,
        userId: userId,
        grams: 8,
        karat: 'K21',
        paidAmount: 42000,
        note: `${DEMO} سلسلة`,
        acquiredOn: d(90),
      },
      {
        householdId: personalId,
        userId: userId,
        grams: 3.5,
        karat: 'K18',
        paidAmount: 15000,
        note: `${DEMO} خاتم`,
        acquiredOn: d(120),
      },
      {
        householdId: personalId,
        userId: userId,
        grams: 5,
        karat: 'K24',
        paidAmount: 28000,
        note: `${DEMO} سبيكة`,
        acquiredOn: d(45),
      },
      {
        householdId: personalId,
        userId: userId,
        grams: 2,
        karat: 'K18',
        paidAmount: null,
        note: `${DEMO} حلق بدون سعر شراء`,
        acquiredOn: d(30),
      },
    ],
  });

  // Outside loans — lend open, lend settled, borrow open, borrow partial repay
  async function makeOutside(opts: {
    person: string;
    direction: 'LEND' | 'BORROW';
    amount: number;
    daysAgo: number;
    note: string;
    accountId: string;
    collections?: { amount: number; daysAgo: number; note: string }[];
  }) {
    const isLend = opts.direction === 'LEND';
    const openCat = isLend ? outsideLendCat : outsideBorrowCat;
    const openType = isLend ? 'EXPENSE' : 'INCOME';
    const openTx = await prisma.transaction.create({
      data: {
        householdId: personalId,
        userId: userId,
        accountId: opts.accountId,
        categoryId: openCat.id,
        type: openType,
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
      },
    });
    const loan = await prisma.outsideLoan.create({
      data: {
        householdId: personalId,
        userId: userId,
        personName: opts.person,
        direction: opts.direction,
        originalAmount: opts.amount,
        note: `${DEMO} ${opts.note}`,
        occurredOn: d(opts.daysAgo),
        accountId: opts.accountId,
        lendTxId: openTx.id,
        status: 'OPEN',
      },
    });
    let collected = 0;
    for (const c of opts.collections ?? []) {
      collected += c.amount;
      const collCat = isLend ? outsideCollectCat : outsideRepayCat;
      const collType = isLend ? 'INCOME' : 'EXPENSE';
      const collTx = await prisma.transaction.create({
        data: {
          householdId: personalId,
          userId: userId,
          accountId: opts.accountId,
          categoryId: collCat.id,
          type: collType,
          amount: c.amount,
          occurredOn: d(c.daysAgo),
          note: `${DEMO} ${c.note}`,
        },
      });
      await prisma.outsideLoanCollection.create({
        data: {
          loanId: loan.id,
          amount: c.amount,
          occurredOn: d(c.daysAgo),
          note: `${DEMO} ${c.note}`,
          accountId: opts.accountId,
          collectTxId: collTx.id,
        },
      });
    }
    if (collected + 0.001 >= opts.amount) {
      await prisma.outsideLoan.update({
        where: { id: loan.id },
        data: { status: 'SETTLED' },
      });
    }
    return loan;
  }

  await makeOutside({
    person: 'أحمد علي',
    direction: 'LEND',
    amount: 5000,
    daysAgo: 30,
    note: 'سلفة لأحمد',
    accountId: pCurrent.id,
    collections: [{ amount: 2000, daysAgo: 7, note: 'تحصيل من أحمد' }],
  });
  await makeOutside({
    person: 'منى',
    direction: 'LEND',
    amount: 1500,
    daysAgo: 90,
    note: 'سلفة لمى — اتقفلت',
    accountId: pCurrent.id,
    collections: [{ amount: 1500, daysAgo: 55, note: 'منى رجّعت الكل' }],
  });
  await makeOutside({
    person: 'كريم شغل',
    direction: 'LEND',
    amount: 8000,
    daysAgo: 60,
    note: 'سلفة كبيرة لسه مفتوحة',
    accountId: pSavings.id,
  });
  await makeOutside({
    person: 'سامح',
    direction: 'BORROW',
    amount: 3000,
    daysAgo: 14,
    note: 'سلفة من سامح',
    accountId: pCurrent.id,
  });
  await makeOutside({
    person: 'عماد',
    direction: 'BORROW',
    amount: 4000,
    daysAgo: 70,
    note: 'دين قديم لعماد',
    accountId: pCurrent.id,
    collections: [
      { amount: 1500, daysAgo: 40, note: 'سداد جزئي لعماد' },
      { amount: 1000, daysAgo: 17, note: 'سداد تاني لعماد' },
    ],
  });

  // Extra personal loan-repayment style spend (category demo)
  await prisma.transaction.create({
    data: tx(pCurrent.id, loanRepay.id, 'EXPENSE', 500, 36, 'رد سلفة قديمة'),
  });

  // Peer loan with another house member (CASH)
  const other = await prisma.membership.findFirst({
    where: { householdId: house.id, userId: { not: user.id } },
    include: { user: true },
  });
  if (other) {
    const peerCat = await cat(house.id, 'Personal loan', 'PEER');
    const otherPersonal = await prisma.membership.findFirst({
      where: { userId: other.userId, household: { kind: 'PERSONAL' } },
    });
    let fromTxId: string | undefined;
    let toTxId: string | undefined;
    if (otherPersonal) {
      const otherCurrent = await wallet(otherPersonal.householdId, 'Current');
      const otherExpense = await ensureCat(
        otherPersonal.householdId,
        'Loan repayment',
        'EXPENSE',
        '#dc2626',
      );
      // Mock lends to other: mock current ↓, other current ↑
      // Use "Family support" or create peer-linked expense on personal — loans service uses specific cats.
      // Simpler: create EXPENSE on mock personal + INCOME on other personal for CASH loan.
      const mockPeerExp = await ensureCat(
        personalId,
        'Family support',
        'EXPENSE',
        '#be185d',
      );
      const otherPeerInc = await ensureCat(
        otherPersonal.householdId,
        'Family gift',
        'INCOME',
        '#db2777',
      );
      const fromTx = await prisma.transaction.create({
        data: {
          householdId: personalId,
          userId: userId,
          accountId: pCurrent.id,
          categoryId: mockPeerExp.id,
          type: 'EXPENSE',
          amount: 2500,
          occurredOn: d(16),
          note: `${DEMO} سلفة لـ ${other.user.name}`,
        },
      });
      const toTx = await prisma.transaction.create({
        data: {
          householdId: otherPersonal.householdId,
          userId: other.userId,
          accountId: otherCurrent.id,
          categoryId: otherPeerInc.id,
          type: 'INCOME',
          amount: 2500,
          occurredOn: d(16),
          note: `${DEMO} سلفة من Mock User`,
        },
      });
      fromTxId = fromTx.id;
      toTxId = toTx.id;
      void otherExpense;
    }
    await prisma.peerLoan.create({
      data: {
        householdId: house.id,
        fromUserId: user.id,
        toUserId: other.userId,
        recordedByUserId: user.id,
        categoryId: peerCat.id,
        originalAmount: 2500,
        note: `${DEMO} سلفة بين العيلة`,
        occurredOn: d(16),
        status: 'OPEN',
        kind: 'CASH',
        fromPersonalTxId: fromTxId,
        toPersonalTxId: toTxId,
      },
    });
    console.log('Peer loan with', other.user.name);
  }

  // House claim: mock paid for house from pocket
  const houseGrocery = await ensureCat(
    house.id,
    'Groceries',
    'EXPENSE',
    '#16a34a',
  );
  const houseBills = await ensureCat(house.id, 'Bills', 'EXPENSE', '#ea580c');
  const claimPersonalTx = await prisma.transaction.create({
    data: {
      householdId: personalId,
      userId: user.id,
      accountId: pCurrent.id,
      categoryId: supermarket.id,
      type: 'EXPENSE',
      amount: 780,
      occurredOn: d(4),
      note: `${DEMO} دفعت من جيبي للبيت`,
    },
  });
  await prisma.houseClaim.create({
    data: {
      householdId: house.id,
      memberId: user.id,
      categoryId: houseGrocery.id,
      amount: 780,
      occurredOn: d(4),
      note: `${DEMO} مشتريات البيت`,
      status: 'OPEN',
      personalTxId: claimPersonalTx.id,
    },
  });

  // House cover: house paid for mock
  const coverHouseTx = await prisma.transaction.create({
    data: {
      householdId: house.id,
      userId: user.id,
      accountId: hCurrent.id,
      categoryId: houseBills.id,
      type: 'EXPENSE',
      amount: 450,
      occurredOn: d(11),
      note: `${DEMO} البيت دفع فاتورة عن Mock`,
    },
  });
  await prisma.houseCover.create({
    data: {
      householdId: house.id,
      memberId: user.id,
      categoryId: houseBills.id,
      amount: 450,
      occurredOn: d(11),
      note: `${DEMO} تغطية فاتورة`,
      status: 'OPEN',
      houseTxId: coverHouseTx.id,
    },
  });

  // Charity gifts (personal debit + house record)
  const charityType = await prisma.charityType.findFirst({
    where: { householdId: house.id, archived: false },
  });
  if (charityType) {
    const personalGiftTx = await prisma.transaction.create({
      data: {
        householdId: personalId,
        userId: userId,
        accountId: pCurrent.id,
        categoryId: sadaqah.id,
        type: 'EXPENSE',
        amount: 500,
        occurredOn: d(3),
        note: `${DEMO} صدقة الشهر من فلوسي`,
      },
    });
    await prisma.charityGift.create({
      data: {
        householdId: house.id,
        typeId: charityType.id,
        memberId: user.id,
        amount: 500,
        occurredOn: d(3),
        note: `${DEMO} صدقة`,
        personalTxId: personalGiftTx.id,
      },
    });
  }

  // A few house expenses attributed to mock for history/analytics flavor
  const houseTransport = await ensureCat(
    house.id,
    'Transport',
    'EXPENSE',
    '#0284c7',
  );
  await prisma.transaction.createMany({
    data: [
      {
        householdId: house.id,
        userId: userId,
        accountId: hCurrent.id,
        categoryId: houseGrocery.id,
        type: 'EXPENSE',
        amount: 620,
        occurredOn: d(13),
        note: `${DEMO} أكل البيت`,
      },
      {
        householdId: house.id,
        userId: userId,
        accountId: hCurrent.id,
        categoryId: houseTransport.id,
        type: 'EXPENSE',
        amount: 200,
        occurredOn: d(15),
        note: `${DEMO} مواصلات بيت`,
      },
    ],
  });

  console.log('');
  console.log('—— Demo login ——');
  console.log(`Email:    ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Name:     ${NAME}`);
  console.log('Personal: ~6mo history, gold×5, goals×5, outside loans, transfers, track');
  console.log('House:    claim, cover, charity gift, sample house spend, peer loan');
  console.log('———————');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
