import { MonthSoftLimitsService } from './month-soft-limits.service';

type MockPrisma = {
  user: { findUnique: jest.Mock };
  monthSoftLimit: {
    upsert: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  account: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  transaction: {
    findFirst: jest.Mock;
    groupBy: jest.Mock;
    create: jest.Mock;
    aggregate: jest.Mock;
  };
  category: { findFirst: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

function makePrisma(): MockPrisma {
  const prisma: MockPrisma = {
    user: { findUnique: jest.fn() },
    monthSoftLimit: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    account: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    category: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (ops: unknown) => ops),
  };
  return prisma;
}

describe('applyMonthStartSaveSweep', () => {
  const householdId = 'hh1';
  const userId = 'u1';
  const currentId = 'acc-current';
  const savingsId = 'acc-savings';

  function setupBase(prisma: MockPrisma) {
    prisma.user.findUnique.mockResolvedValue({ budgetMonthStartDay: 1 });
    prisma.monthSoftLimit.upsert.mockResolvedValue({
      id: 'msl1',
      householdId,
      periodKey: expect.any(String),
      autoSweepDone: false,
      autoSweptAmount: 0,
    });
    prisma.monthSoftLimit.updateMany.mockResolvedValue({ count: 1 });
    prisma.monthSoftLimit.update.mockResolvedValue({});
    prisma.transaction.findFirst.mockResolvedValue(null);
    prisma.account.findMany.mockResolvedValue([
      {
        id: currentId,
        name: 'Current',
        archived: false,
        openingBalance: 0,
        type: 'CASH',
      },
      {
        id: savingsId,
        name: 'Savings',
        archived: false,
        openingBalance: 0,
        type: 'CASH',
      },
    ]);
    prisma.category.findFirst.mockImplementation(
      async ({ where }: { where: { kind: string } }) => ({
        id: `cat-${where.kind}`,
        name: 'Wallet transfer',
        kind: where.kind,
      }),
    );
  }

  it('moves min(saved, current balance) Current → Savings', async () => {
    const prisma = makePrisma();
    setupBase(prisma);

    // cashFlow groupBy for previous period: income 50k, expense 20k → saved 30k
    // then walletBalance groupBy for Current: income 40k → bal 40k
    prisma.transaction.groupBy
      .mockResolvedValueOnce([
        { type: 'INCOME', _sum: { amount: 50000 } },
        { type: 'EXPENSE', _sum: { amount: 20000 } },
      ])
      .mockResolvedValueOnce([{ type: 'INCOME', _sum: { amount: 40000 } }]);

    const service = new MonthSoftLimitsService(prisma as never);
    const result = await service.applyMonthStartSaveSweep(householdId, userId);

    expect(result.autoSweptAmount).toBe(30000);
    expect(result.autoSweepDone).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.monthSoftLimit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoSweptAmount: expect.anything(),
        }),
      }),
    );
  });

  it('caps by Current balance when shorter than saved', async () => {
    const prisma = makePrisma();
    setupBase(prisma);

    prisma.transaction.groupBy
      .mockResolvedValueOnce([
        { type: 'INCOME', _sum: { amount: 50000 } },
        { type: 'EXPENSE', _sum: { amount: 20000 } },
      ])
      .mockResolvedValueOnce([{ type: 'INCOME', _sum: { amount: 12000 } }]);

    const service = new MonthSoftLimitsService(prisma as never);
    const result = await service.applyMonthStartSaveSweep(householdId, userId);

    expect(result.autoSweptAmount).toBe(12000);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('marks done with 0 when previous saved is not positive', async () => {
    const prisma = makePrisma();
    setupBase(prisma);

    prisma.transaction.groupBy
      .mockResolvedValueOnce([
        { type: 'INCOME', _sum: { amount: 10000 } },
        { type: 'EXPENSE', _sum: { amount: 15000 } },
      ])
      .mockResolvedValueOnce([{ type: 'INCOME', _sum: { amount: 5000 } }]);

    const service = new MonthSoftLimitsService(prisma as never);
    const result = await service.applyMonthStartSaveSweep(householdId, userId);

    expect(result.autoSweptAmount).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not transfer again when autoSweepDone is already true', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ budgetMonthStartDay: 1 });
    prisma.monthSoftLimit.upsert.mockResolvedValue({
      id: 'msl1',
      autoSweepDone: true,
      autoSweptAmount: 30000,
    });

    const service = new MonthSoftLimitsService(prisma as never);
    const result = await service.applyMonthStartSaveSweep(householdId, userId);

    expect(result.autoSweptAmount).toBe(30000);
    expect(prisma.monthSoftLimit.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips creating transfers when a Month save note already exists', async () => {
    const prisma = makePrisma();
    setupBase(prisma);
    prisma.transaction.findFirst.mockResolvedValue({ amount: 25000 });

    const service = new MonthSoftLimitsService(prisma as never);
    const result = await service.applyMonthStartSaveSweep(householdId, userId);

    expect(result.autoSweptAmount).toBe(25000);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
