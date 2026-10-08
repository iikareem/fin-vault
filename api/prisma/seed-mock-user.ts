/**
 * Idempotent demo seeder for a rich mock_user account with sample data
 * across personal + house features (txs, goals, gold, outside/peer loans,
 * travels, soft limits, subscriptions, claims/covers + repayments,
 * charity, payouts).
 *
 * Usage:
 *   npm run prisma:seed-mock
 *   # or: DATABASE_URL='postgresql://…' npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-mock-user.ts
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

/** Personal budget period key YYYY-MM, relative to today. */
function periodKey(monthsAgo: number) {
  const x = new Date();
  x.setUTCDate(1);
  x.setUTCHours(12, 0, 0, 0);
  x.setUTCMonth(x.getUTCMonth() - monthsAgo);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
  // Travels (+ linked spend) on personal — txs first (Restrict on travelId)
  const travels = await prisma.travel.findMany({
    where: { householdId: personalId, note: { startsWith: DEMO } },
  });
  for (const t of travels) {
    await prisma.transaction.deleteMany({ where: { travelId: t.id } });
    await prisma.travel.delete({ where: { id: t.id } });
  }

  // Soft monthly save targets
  await prisma.monthSoftLimit.deleteMany({ where: { householdId: personalId } });

  // Subscriptions (+ payment txs)
  const subs = await prisma.subscription.findMany({
    where: { userId },
    include: { payments: true },
  });
  for (const s of subs) {
    for (const p of s.payments) {
      await prisma.subscriptionPayment.delete({ where: { id: p.id } });
      await prisma.transaction
        .delete({ where: { id: p.transactionId } })
        .catch(() => undefined);
    }
    await prisma.subscription.delete({ where: { id: s.id } });
  }

  // House payouts received by mock
  const payouts = await prisma.housePayout.findMany({
    where: { toUserId: userId, note: { startsWith: DEMO } },
  });
  for (const p of payouts) {
    await prisma.housePayout.delete({ where: { id: p.id } });
    await prisma.transaction
      .delete({ where: { id: p.houseTxId } })
      .catch(() => undefined);
    await prisma.transaction
      .delete({ where: { id: p.personalTxId } })
      .catch(() => undefined);
  }

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
      if (c.collectTxId) {
        await prisma.transaction
          .delete({ where: { id: c.collectTxId } })
          .catch(() => undefined);
      }
    }
    await prisma.outsideLoan.delete({ where: { id: loan.id } });
    if (loan.lendTxId) {
      await prisma.transaction
        .delete({ where: { id: loan.lendTxId } })
        .catch(() => undefined);
    }
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
  const houseId = house.id;

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

  const toHouseCat = await ensureCat(
    personalId,
    'To the house',
    'EXPENSE',
    '#44403c',
  );
  const houseGrocery = await ensureCat(
    house.id,
    'Groceries',
    'EXPENSE',
    '#16a34a',
  );
  const houseBills = await ensureCat(house.id, 'Bills', 'EXPENSE', '#ea580c');
  const houseTransport = await ensureCat(
    house.id,
    'Transport',
    'EXPENSE',
    '#0284c7',
  );
  const houseAllowance = await ensureCat(
    house.id,
    'Allowance',
    'EXPENSE',
    '#0284c7',
  );
  const houseFamilyGift = await ensureCat(
    house.id,
    'Family gift',
    'EXPENSE',
    '#db2777',
  );
  const paybackCat = await ensureCat(
    house.id,
    'Member payback',
    'EXPENSE',
    '#44403c',
  );
  const memberRepayInc = await ensureCat(
    house.id,
    'Member repayment',
    'INCOME',
    '#0f766e',
  );

  const adminMem = await prisma.membership.findFirst({
    where: { householdId: house.id, role: 'ADMIN' },
  });
  const recorderId = adminMem?.userId ?? userId;

  // —— Travels: past / active / upcoming + spend ——
  const pastTrip = await prisma.travel.create({
    data: {
      householdId: personalId,
      name: 'أسوان',
      currency: 'EGP',
      softLimit: 8000,
      startsOn: d(55),
      endsOn: d(48),
      endedAt: d(48),
      note: `${DEMO} رحلة خلصت`,
    },
  });
  const activeTrip = await prisma.travel.create({
    data: {
      householdId: personalId,
      name: 'إسكندرية',
      currency: 'EGP',
      softLimit: 5000,
      startsOn: d(3),
      endsOn: d(-10),
      note: `${DEMO} رحلة شغّالة`,
    },
  });
  await prisma.travel.create({
    data: {
      householdId: personalId,
      name: 'دبي',
      currency: 'AED',
      softLimit: 4000,
      startsOn: d(-25),
      endsOn: d(-32),
      note: `${DEMO} رحلة جاية`,
    },
  });
  await prisma.transaction.createMany({
    data: [
      {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: dining.id,
        travelId: pastTrip.id,
        type: 'EXPENSE',
        amount: 1200,
        occurredOn: d(53),
        note: `${DEMO} عشاء في أسوان`,
      },
      {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: localTrips.id,
        travelId: pastTrip.id,
        type: 'EXPENSE',
        amount: 3500,
        occurredOn: d(52),
        note: `${DEMO} مواصلات أسوان`,
      },
      {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: entertainment.id,
        travelId: pastTrip.id,
        type: 'TRACK',
        amount: 400,
        occurredOn: d(50),
        note: `${DEMO} ضيافة أسوان كاش`,
      },
      {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: dining.id,
        travelId: activeTrip.id,
        type: 'EXPENSE',
        amount: 680,
        occurredOn: d(2),
        note: `${DEMO} فطار إسكندرية`,
      },
      {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: fuel.id,
        travelId: activeTrip.id,
        type: 'EXPENSE',
        amount: 900,
        occurredOn: d(1),
        note: `${DEMO} بنزين رحلة`,
      },
      {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: entertainment.id,
        travelId: activeTrip.id,
        type: 'TRACK',
        amount: 250,
        occurredOn: d(0),
        note: `${DEMO} تذكرة كاش`,
      },
    ],
  });

  // —— Month soft limits (save targets) ——
  await prisma.monthSoftLimit.createMany({
    data: [
      {
        householdId: personalId,
        periodKey: periodKey(2),
        saveTargetAmount: 4000,
      },
      {
        householdId: personalId,
        periodKey: periodKey(1),
        saveTargetAmount: 5000,
      },
      {
        householdId: personalId,
        periodKey: periodKey(0),
        saveTargetAmount: 6000,
      },
    ],
  });

  // —— Subscriptions: sub / installment / charity / other ——
  async function paySub(
    subscriptionId: string,
    categoryId: string,
    amount: number,
    monthsAgo: number,
    note: string,
  ) {
    const key = periodKey(monthsAgo);
    const payTx = await prisma.transaction.create({
      data: {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId,
        type: 'EXPENSE',
        amount,
        occurredOn: d(monthsAgo * 30 + 5),
        note: `${DEMO} ${note}`,
      },
    });
    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        periodKey: key,
        amount,
        paidOn: d(monthsAgo * 30 + 5),
        transactionId: payTx.id,
      },
    });
  }

  const netflix = await prisma.subscription.create({
    data: {
      householdId: personalId,
      userId,
      name: 'نتفلكس',
      amount: 299,
      billingDay: 5,
      kind: 'SUBSCRIPTION',
      startPeriodKey: periodKey(4),
      categoryId: subs.id,
      accountId: pCurrent.id,
      note: `${DEMO} اشتراك شهري`,
      color: '#4f46e5',
      active: true,
    },
  });
  await paySub(netflix.id, subs.id, 299, 2, 'دفع نتفلكس');
  await paySub(netflix.id, subs.id, 299, 1, 'دفع نتفلكس');
  // current month left unpaid → due/overdue for testing Mark Paid

  const carPlan = await prisma.subscription.create({
    data: {
      householdId: personalId,
      userId,
      name: 'قسط عربية',
      amount: 6500,
      billingDay: 1,
      kind: 'INSTALLMENT',
      totalInstallments: 12,
      installmentsPaid: 3,
      startPeriodKey: periodKey(3),
      categoryId: carInstall.id,
      accountId: pCurrent.id,
      note: `${DEMO} أقساط`,
      color: '#b45309',
      active: true,
    },
  });
  await paySub(carPlan.id, carInstall.id, 6500, 3, 'قسط عربية ١');
  await paySub(carPlan.id, carInstall.id, 6500, 2, 'قسط عربية ٢');
  await paySub(carPlan.id, carInstall.id, 6500, 1, 'قسط عربية ٣');

  await prisma.subscription.create({
    data: {
      householdId: personalId,
      userId,
      name: 'صدقة شهرية',
      amount: 200,
      billingDay: 10,
      kind: 'CHARITY',
      startPeriodKey: periodKey(1),
      categoryId: sadaqah.id,
      accountId: pCurrent.id,
      note: `${DEMO} تعهد صدقة`,
      color: '#0f766e',
      active: true,
    },
  });
  // unpaid this period

  const gymSub = await prisma.subscription.create({
    data: {
      householdId: personalId,
      userId,
      name: 'جيم قديم',
      amount: 800,
      billingDay: 15,
      kind: 'OTHER',
      startPeriodKey: periodKey(6),
      categoryId: sports.id,
      accountId: pCurrent.id,
      note: `${DEMO} اتوقف`,
      color: '#7c3aed',
      active: false,
    },
  });
  await paySub(gymSub.id, sports.id, 800, 5, 'دفع جيم قديم');

  // Peer loans with another house member
  const other = await prisma.membership.findFirst({
    where: { householdId: house.id, userId: { not: user.id } },
    include: { user: true },
  });
  if (other) {
    const peerCat = await cat(house.id, 'Personal loan', 'PEER');
    const otherPersonal = await prisma.membership.findFirst({
      where: { userId: other.userId, household: { kind: 'PERSONAL' } },
    });
    const mockPeerExp = await ensureCat(
      personalId,
      'Family support',
      'EXPENSE',
      '#be185d',
    );
    const mockPeerInc = await ensureCat(
      personalId,
      'Family gift',
      'INCOME',
      '#db2777',
    );

    let otherCurrentId: string | undefined;
    let otherPeerExpId: string | undefined;
    let otherPeerIncId: string | undefined;
    if (otherPersonal) {
      const otherCurrent = await wallet(otherPersonal.householdId, 'Current');
      otherCurrentId = otherCurrent.id;
      otherPeerExpId = (
        await ensureCat(
          otherPersonal.householdId,
          'Family support',
          'EXPENSE',
          '#be185d',
        )
      ).id;
      otherPeerIncId = (
        await ensureCat(
          otherPersonal.householdId,
          'Family gift',
          'INCOME',
          '#db2777',
        )
      ).id;
    }

    // 1) Mock lent cash — still OPEN (no repayments)
    {
      let fromTxId: string | undefined;
      let toTxId: string | undefined;
      if (otherPersonal && otherCurrentId && otherPeerIncId) {
        const fromTx = await prisma.transaction.create({
          data: {
            householdId: personalId,
            userId,
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
            accountId: otherCurrentId,
            categoryId: otherPeerIncId,
            type: 'INCOME',
            amount: 2500,
            occurredOn: d(16),
            note: `${DEMO} سلفة من Mock User`,
          },
        });
        fromTxId = fromTx.id;
        toTxId = toTx.id;
      }
      await prisma.peerLoan.create({
        data: {
          householdId: house.id,
          fromUserId: user.id,
          toUserId: other.userId,
          recordedByUserId: user.id,
          categoryId: peerCat.id,
          originalAmount: 2500,
          note: `${DEMO} سلفة مفتوحة للعيلة`,
          occurredOn: d(16),
          status: 'OPEN',
          kind: 'CASH',
          fromPersonalTxId: fromTxId,
          toPersonalTxId: toTxId,
        },
      });
    }

    // 2) Mock lent cash — partial repayment from other
    {
      let fromTxId: string | undefined;
      let toTxId: string | undefined;
      if (otherPersonal && otherCurrentId && otherPeerIncId) {
        const fromTx = await prisma.transaction.create({
          data: {
            householdId: personalId,
            userId,
            accountId: pCurrent.id,
            categoryId: mockPeerExp.id,
            type: 'EXPENSE',
            amount: 4000,
            occurredOn: d(40),
            note: `${DEMO} سلفة كبيرة لـ ${other.user.name}`,
          },
        });
        const toTx = await prisma.transaction.create({
          data: {
            householdId: otherPersonal.householdId,
            userId: other.userId,
            accountId: otherCurrentId,
            categoryId: otherPeerIncId,
            type: 'INCOME',
            amount: 4000,
            occurredOn: d(40),
            note: `${DEMO} سلفة كبيرة من Mock`,
          },
        });
        fromTxId = fromTx.id;
        toTxId = toTx.id;
      }
      const loan = await prisma.peerLoan.create({
        data: {
          householdId: house.id,
          fromUserId: user.id,
          toUserId: other.userId,
          recordedByUserId: user.id,
          categoryId: peerCat.id,
          originalAmount: 4000,
          note: `${DEMO} سلفة جزئي السداد`,
          occurredOn: d(40),
          status: 'OPEN',
          kind: 'CASH',
          fromPersonalTxId: fromTxId,
          toPersonalTxId: toTxId,
        },
      });
      if (otherPersonal && otherCurrentId && otherPeerExpId) {
        const repayFrom = await prisma.transaction.create({
          data: {
            householdId: otherPersonal.householdId,
            userId: other.userId,
            accountId: otherCurrentId,
            categoryId: otherPeerExpId,
            type: 'EXPENSE',
            amount: 1500,
            occurredOn: d(12),
            note: `${DEMO} سداد جزئي لـ Mock`,
          },
        });
        const repayTo = await prisma.transaction.create({
          data: {
            householdId: personalId,
            userId,
            accountId: pCurrent.id,
            categoryId: mockPeerInc.id,
            type: 'INCOME',
            amount: 1500,
            occurredOn: d(12),
            note: `${DEMO} تحصيل من ${other.user.name}`,
          },
        });
        await prisma.loanRepayment.create({
          data: {
            loanId: loan.id,
            amount: 1500,
            occurredOn: d(12),
            note: `${DEMO} قسط أول`,
            recordedByUserId: other.userId,
            fromPersonalTxId: repayFrom.id,
            toPersonalTxId: repayTo.id,
          },
        });
      }
    }

    // 3) Mock borrowed TRACK_ONLY — open (no cash move)
    await prisma.peerLoan.create({
      data: {
        householdId: house.id,
        fromUserId: other.userId,
        toUserId: user.id,
        recordedByUserId: user.id,
        categoryId: peerCat.id,
        originalAmount: 1200,
        note: `${DEMO} دين تتبع فقط`,
        occurredOn: d(9),
        status: 'OPEN',
        kind: 'TRACK_ONLY',
      },
    });

    // 4) Mock borrowed CASH — settled after full repay
    {
      let fromTxId: string | undefined;
      let toTxId: string | undefined;
      if (otherPersonal && otherCurrentId && otherPeerExpId) {
        const fromTx = await prisma.transaction.create({
          data: {
            householdId: otherPersonal.householdId,
            userId: other.userId,
            accountId: otherCurrentId,
            categoryId: otherPeerExpId,
            type: 'EXPENSE',
            amount: 1800,
            occurredOn: d(70),
            note: `${DEMO} سلفة لـ Mock`,
          },
        });
        const toTx = await prisma.transaction.create({
          data: {
            householdId: personalId,
            userId,
            accountId: pCurrent.id,
            categoryId: mockPeerInc.id,
            type: 'INCOME',
            amount: 1800,
            occurredOn: d(70),
            note: `${DEMO} سلفة من ${other.user.name}`,
          },
        });
        fromTxId = fromTx.id;
        toTxId = toTx.id;
      }
      const loan = await prisma.peerLoan.create({
        data: {
          householdId: house.id,
          fromUserId: other.userId,
          toUserId: user.id,
          recordedByUserId: user.id,
          categoryId: peerCat.id,
          originalAmount: 1800,
          note: `${DEMO} دين اتقفل`,
          occurredOn: d(70),
          status: 'SETTLED',
          kind: 'CASH',
          fromPersonalTxId: fromTxId,
          toPersonalTxId: toTxId,
        },
      });
      const repayFrom = await prisma.transaction.create({
        data: {
          householdId: personalId,
          userId,
          accountId: pCurrent.id,
          categoryId: mockPeerExp.id,
          type: 'EXPENSE',
          amount: 1800,
          occurredOn: d(50),
          note: `${DEMO} سداد كامل لـ ${other.user.name}`,
        },
      });
      let repayToId: string | undefined;
      if (otherPersonal && otherCurrentId && otherPeerIncId) {
        const repayTo = await prisma.transaction.create({
          data: {
            householdId: otherPersonal.householdId,
            userId: other.userId,
            accountId: otherCurrentId,
            categoryId: otherPeerIncId,
            type: 'INCOME',
            amount: 1800,
            occurredOn: d(50),
            note: `${DEMO} تحصيل من Mock`,
          },
        });
        repayToId = repayTo.id;
      }
      await prisma.loanRepayment.create({
        data: {
          loanId: loan.id,
          amount: 1800,
          occurredOn: d(50),
          note: `${DEMO} سداد كامل`,
          recordedByUserId: user.id,
          fromPersonalTxId: repayFrom.id,
          toPersonalTxId: repayToId,
        },
      });
    }

    console.log('Peer loans with', other.user.name);
  }

  // —— House claims: OPEN / PARTIAL / REIMBURSED ——
  async function makeClaim(opts: {
    amount: number;
    daysAgo: number;
    note: string;
    categoryId: string;
    personalCatId: string;
    status: 'OPEN' | 'PARTIAL' | 'REIMBURSED';
    reimbursements?: { amount: number; daysAgo: number; note: string }[];
  }) {
    const personalTx = await prisma.transaction.create({
      data: {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: opts.personalCatId,
        type: 'EXPENSE',
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
      },
    });
    const claim = await prisma.houseClaim.create({
      data: {
        householdId: houseId,
        memberId: userId,
        categoryId: opts.categoryId,
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
        status: opts.status,
        personalTxId: personalTx.id,
      },
    });
    for (const r of opts.reimbursements ?? []) {
      const houseTx = await prisma.transaction.create({
        data: {
          householdId: houseId,
          userId: recorderId,
          accountId: hCurrent.id,
          categoryId: paybackCat.id,
          type: 'REIMBURSEMENT',
          amount: r.amount,
          occurredOn: d(r.daysAgo),
          note: `${DEMO} ${r.note}`,
        },
      });
      const personalInc = await prisma.transaction.create({
        data: {
          householdId: personalId,
          userId,
          accountId: pCurrent.id,
          categoryId: fromHouse.id,
          type: 'INCOME',
          amount: r.amount,
          occurredOn: d(r.daysAgo),
          note: `${DEMO} ${r.note}`,
        },
      });
      await prisma.reimbursement.create({
        data: {
          claimId: claim.id,
          amount: r.amount,
          occurredOn: d(r.daysAgo),
          accountId: hCurrent.id,
          transactionId: houseTx.id,
          personalTxId: personalInc.id,
          recordedByUserId: recorderId,
        },
      });
    }
  }

  await makeClaim({
    amount: 780,
    daysAgo: 4,
    note: 'مشتريات البيت — لسه مفتوحة',
    categoryId: houseGrocery.id,
    personalCatId: supermarket.id,
    status: 'OPEN',
  });
  await makeClaim({
    amount: 1200,
    daysAgo: 25,
    note: 'فاتورة جزئي الاسترداد',
    categoryId: houseBills.id,
    personalCatId: electricity.id,
    status: 'PARTIAL',
    reimbursements: [
      { amount: 500, daysAgo: 10, note: 'جزء من استرداد الفاتورة' },
    ],
  });
  await makeClaim({
    amount: 350,
    daysAgo: 45,
    note: 'مواصلات اتردت كاملة',
    categoryId: houseTransport.id,
    personalCatId: rides.id,
    status: 'REIMBURSED',
    reimbursements: [
      { amount: 350, daysAgo: 38, note: 'استرداد كامل للمواصلات' },
    ],
  });

  // —— House covers: OPEN / PARTIAL / SETTLED ——
  async function makeCover(opts: {
    amount: number;
    daysAgo: number;
    note: string;
    categoryId: string;
    status: 'OPEN' | 'PARTIAL' | 'SETTLED';
    repayments?: { amount: number; daysAgo: number; note: string }[];
  }) {
    const houseTx = await prisma.transaction.create({
      data: {
        householdId: houseId,
        userId: recorderId,
        accountId: hCurrent.id,
        categoryId: opts.categoryId,
        type: 'EXPENSE',
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
      },
    });
    const cover = await prisma.houseCover.create({
      data: {
        householdId: houseId,
        memberId: userId,
        categoryId: opts.categoryId,
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
        status: opts.status,
        houseTxId: houseTx.id,
      },
    });
    for (const r of opts.repayments ?? []) {
      const repayHouse = await prisma.transaction.create({
        data: {
          householdId: houseId,
          userId: recorderId,
          accountId: hCurrent.id,
          categoryId: memberRepayInc.id,
          type: 'INCOME',
          amount: r.amount,
          occurredOn: d(r.daysAgo),
          note: `${DEMO} ${r.note}`,
        },
      });
      const repayPersonal = await prisma.transaction.create({
        data: {
          householdId: personalId,
          userId,
          accountId: pCurrent.id,
          categoryId: toHouseCat.id,
          type: 'EXPENSE',
          amount: r.amount,
          occurredOn: d(r.daysAgo),
          note: `${DEMO} ${r.note}`,
        },
      });
      await prisma.coverRepayment.create({
        data: {
          coverId: cover.id,
          amount: r.amount,
          occurredOn: d(r.daysAgo),
          accountId: hCurrent.id,
          houseTxId: repayHouse.id,
          personalTxId: repayPersonal.id,
          recordedByUserId: userId,
        },
      });
    }
  }

  await makeCover({
    amount: 450,
    daysAgo: 11,
    note: 'تغطية فاتورة — مفتوحة',
    categoryId: houseBills.id,
    status: 'OPEN',
  });
  await makeCover({
    amount: 900,
    daysAgo: 35,
    note: 'تغطية سوبرماركت — جزئي',
    categoryId: houseGrocery.id,
    status: 'PARTIAL',
    repayments: [
      { amount: 300, daysAgo: 18, note: 'سداد جزئي للتغطية' },
    ],
  });
  await makeCover({
    amount: 200,
    daysAgo: 60,
    note: 'تغطية مواصلات — اتقفلت',
    categoryId: houseTransport.id,
    status: 'SETTLED',
    repayments: [
      { amount: 200, daysAgo: 52, note: 'سداد كامل للتغطية' },
    ],
  });

  // —— Charity: from personal + from house wallet ——
  const charityType = await prisma.charityType.findFirst({
    where: { householdId: house.id, archived: false },
  });
  if (charityType) {
    const personalGiftTx = await prisma.transaction.create({
      data: {
        householdId: personalId,
        userId,
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
        note: `${DEMO} صدقة من الشخصي`,
        personalTxId: personalGiftTx.id,
      },
    });

    const houseCharityCat = await ensureCat(
      house.id,
      charityType.name,
      'EXPENSE',
      charityType.color,
    );
    const houseGiftTx = await prisma.transaction.create({
      data: {
        householdId: house.id,
        userId: recorderId,
        accountId: hCurrent.id,
        categoryId: houseCharityCat.id,
        type: 'EXPENSE',
        amount: 300,
        occurredOn: d(8),
        note: `${DEMO} صدقة من فلوس البيت (سجلها Mock)`,
      },
    });
    await prisma.charityGift.create({
      data: {
        householdId: house.id,
        typeId: charityType.id,
        memberId: user.id,
        amount: 300,
        occurredOn: d(8),
        note: `${DEMO} صدقة من البيت`,
        houseTxId: houseGiftTx.id,
      },
    });
  }

  // —— House payouts (allowance + family gift) to mock ——
  async function makePayout(opts: {
    amount: number;
    daysAgo: number;
    note: string;
    houseCatId: string;
    personalCatId: string;
  }) {
    const houseTx = await prisma.transaction.create({
      data: {
        householdId: houseId,
        userId: recorderId,
        accountId: hCurrent.id,
        categoryId: opts.houseCatId,
        type: 'EXPENSE',
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${NAME} · ${DEMO} ${opts.note}`,
      },
    });
    const personalTx = await prisma.transaction.create({
      data: {
        householdId: personalId,
        userId,
        accountId: pCurrent.id,
        categoryId: opts.personalCatId,
        type: 'INCOME',
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
      },
    });
    await prisma.housePayout.create({
      data: {
        householdId: houseId,
        toUserId: userId,
        recordedByUserId: recorderId,
        amount: opts.amount,
        occurredOn: d(opts.daysAgo),
        note: `${DEMO} ${opts.note}`,
        houseTxId: houseTx.id,
        personalTxId: personalTx.id,
      },
    });
  }

  await makePayout({
    amount: 2000,
    daysAgo: 20,
    note: 'مصروف من البيت',
    houseCatId: houseAllowance.id,
    personalCatId: allowance.id,
  });
  await makePayout({
    amount: 1000,
    daysAgo: 55,
    note: 'هدية عيلة من البيت',
    houseCatId: houseFamilyGift.id,
    personalCatId: familyGiftIn.id,
  });

  // A few house expenses attributed to mock for history/analytics flavor
  await prisma.transaction.createMany({
    data: [
      {
        householdId: house.id,
        userId,
        accountId: hCurrent.id,
        categoryId: houseGrocery.id,
        type: 'EXPENSE',
        amount: 620,
        occurredOn: d(13),
        note: `${DEMO} أكل البيت`,
      },
      {
        householdId: house.id,
        userId,
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
  console.log(
    'Personal: ~6mo txs, gold×5, goals×5, outside loans, transfers, track,',
  );
  console.log(
    '          travels×3, soft limits×3, subscriptions×4 (+payments)',
  );
  console.log(
    'House:    claims×3, covers×3, charity×2, payouts×2, peer loans×4, house spend',
  );
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
