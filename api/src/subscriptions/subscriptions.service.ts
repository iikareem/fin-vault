import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  budgetMonthRange,
  clampBudgetStartDay,
  isoLocal,
  pad2,
} from '../common/calendar';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { PaySubscriptionDto } from './dto/pay-subscription.dto';

const SUB_COLORS = [
  '#4f46e5',
  '#0369a1',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#7c3aed',
] as const;

type SubRow = {
  id: string;
  name: string;
  amount: Prisma.Decimal;
  billingDay: number;
  kind: SubscriptionKind;
  totalInstallments: number | null;
  installmentsPaid: number;
  categoryId: string;
  accountId: string;
  note: string;
  color: string;
  active: boolean;
  category: {
    id: string;
    name: string;
    nameAr: string;
    color: string;
    emoji: string;
  };
  account: { id: string; name: string };
  payments: {
    id: string;
    periodKey: string;
    amount: Prisma.Decimal;
    paidOn: Date;
    transactionId: string;
  }[];
};

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  private dueDateInPeriod(
    periodFrom: string,
    periodTo: string,
    billingDay: number,
    startDay: number,
  ) {
    const day = clampBudgetStartDay(billingDay);
    const [fy, fm] = periodFrom.split('-').map(Number);
    if (startDay === 1) {
      return `${fy}-${pad2(fm)}-${pad2(day)}`;
    }
    // Custom budget period: [startDay of M … startDay-1 of M+1]
    if (day >= startDay) {
      return `${fy}-${pad2(fm)}-${pad2(day)}`;
    }
    const next = new Date(fy, fm, day); // month fm is 1-indexed → Date month fm = next calendar month
    return isoLocal(next);
  }

  private statusFor(
    paid: boolean,
    dueOn: string,
    today: string,
  ): 'paid' | 'due' | 'upcoming' | 'overdue' {
    if (paid) return 'paid';
    if (today > dueOn) return 'overdue';
    if (today === dueOn) return 'due';
    return 'upcoming';
  }

  private async periodContext(userId: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { budgetMonthStartDay: true },
    });
    const startDay = clampBudgetStartDay(user?.budgetMonthStartDay ?? 1);
    const range = budgetMonthRange(now, startDay);
    const today = isoLocal(now);
    return {
      startDay,
      periodKey: range.key,
      periodFrom: range.from,
      periodTo: range.to,
      today,
    };
  }

  private normalizeKindFields(
    kind: SubscriptionKind,
    totalInstallments?: number | null,
  ) {
    if (kind === SubscriptionKind.INSTALLMENT) {
      const total =
        totalInstallments == null || totalInstallments === undefined
          ? null
          : totalInstallments;
      if (total != null && total < 1) {
        throw new BadRequestException(
          'Number of months must be at least 1',
        );
      }
      // null = open-ended; user closes manually when done
      return { kind, totalInstallments: total };
    }
    return { kind, totalInstallments: null as number | null };
  }

  private notePrefix(kind: SubscriptionKind) {
    switch (kind) {
      case SubscriptionKind.INSTALLMENT:
        return 'Installment';
      case SubscriptionKind.CHARITY:
        return 'Charity';
      case SubscriptionKind.OTHER:
        return 'Commitment';
      default:
        return 'Subscription';
    }
  }

  private shape(
    sub: SubRow,
    ctx: {
      startDay: number;
      periodKey: string;
      periodFrom: string;
      periodTo: string;
      today: string;
    },
  ) {
    const payment = sub.payments.find((p) => p.periodKey === ctx.periodKey);
    const dueOn = this.dueDateInPeriod(
      ctx.periodFrom,
      ctx.periodTo,
      sub.billingDay,
      ctx.startDay,
    );
    const status = this.statusFor(Boolean(payment), dueOn, ctx.today);
    const remainingInstallments =
      sub.kind === SubscriptionKind.INSTALLMENT && sub.totalInstallments != null
        ? Math.max(0, sub.totalInstallments - sub.installmentsPaid)
        : null;
    return {
      id: sub.id,
      name: sub.name,
      amount: Number(sub.amount),
      billingDay: sub.billingDay,
      kind: sub.kind,
      totalInstallments: sub.totalInstallments,
      installmentsPaid: sub.installmentsPaid,
      remainingInstallments,
      categoryId: sub.categoryId,
      accountId: sub.accountId,
      note: sub.note,
      color: sub.color,
      active: sub.active,
      category: sub.category,
      account: sub.account,
      dueOn,
      status,
      payment: payment
        ? {
            id: payment.id,
            periodKey: payment.periodKey,
            amount: Number(payment.amount),
            paidOn: payment.paidOn,
            transactionId: payment.transactionId,
          }
        : null,
    };
  }

  private async loadVisible(householdId: string, periodKey: string) {
    return this.prisma.subscription.findMany({
      where: {
        householdId,
        OR: [
          { active: true },
          // Keep closed installments visible so they can be reopened
          { kind: SubscriptionKind.INSTALLMENT, active: false },
        ],
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            color: true,
            emoji: true,
          },
        },
        account: { select: { id: true, name: true } },
        payments: { where: { periodKey } },
      },
      orderBy: [{ active: 'desc' }, { billingDay: 'asc' }, { name: 'asc' }],
    });
  }

  async summary(householdId: string, userId: string) {
    const ctx = await this.periodContext(userId);
    const rows = await this.loadVisible(householdId, ctx.periodKey);
    const subscriptions = rows.map((s) => this.shape(s, ctx));
    const open = subscriptions.filter((s) => s.active);

    const monthlyTotal =
      Math.round(open.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const paid = open.filter((s) => s.status === 'paid');
    const unpaid = open.filter((s) => s.status !== 'paid');
    const paidAmount =
      Math.round(paid.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const dueAmount =
      Math.round(unpaid.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    return {
      periodKey: ctx.periodKey,
      periodFrom: ctx.periodFrom,
      periodTo: ctx.periodTo,
      budgetMonthStartDay: ctx.startDay,
      monthlyTotal,
      paidCount: paid.length,
      unpaidCount: unpaid.length,
      paidAmount,
      dueAmount,
      subscriptions,
    };
  }

  private async assertCategory(householdId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, householdId, kind: 'EXPENSE', hidden: false },
    });
    if (!category) throw new BadRequestException('Pick an expense category');
    return category;
  }

  private async assertAccount(householdId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, householdId, archived: false },
    });
    if (!account) throw new BadRequestException('Pick a wallet');
    return account;
  }

  private async nextColor(householdId: string) {
    const count = await this.prisma.subscription.count({
      where: { householdId },
    });
    return SUB_COLORS[count % SUB_COLORS.length];
  }

  private async requireOwn(
    householdId: string,
    userId: string,
    id: string,
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, householdId, userId },
    });
    if (!sub) throw new NotFoundException();
    return sub;
  }

  async create(
    householdId: string,
    userId: string,
    dto: CreateSubscriptionDto,
  ) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const billingDay = clampBudgetStartDay(dto.billingDay);
    const kind = dto.kind ?? SubscriptionKind.SUBSCRIPTION;
    const fields = this.normalizeKindFields(kind, dto.totalInstallments);
    await this.assertCategory(householdId, dto.categoryId);
    await this.assertAccount(householdId, dto.accountId);

    await this.prisma.subscription.create({
      data: {
        householdId,
        userId,
        name,
        amount: new Prisma.Decimal(dto.amount),
        billingDay,
        kind: fields.kind,
        totalInstallments: fields.totalInstallments,
        installmentsPaid: 0,
        categoryId: dto.categoryId,
        accountId: dto.accountId,
        note: dto.note?.trim() ?? '',
        color: dto.color ?? (await this.nextColor(householdId)),
      },
    });
    return this.summary(householdId, userId);
  }

  async update(
    householdId: string,
    userId: string,
    id: string,
    dto: UpdateSubscriptionDto,
  ) {
    const existing = await this.requireOwn(householdId, userId, id);
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Name is required');
    }
    if (dto.categoryId) await this.assertCategory(householdId, dto.categoryId);
    if (dto.accountId) await this.assertAccount(householdId, dto.accountId);

    const nextKind = dto.kind ?? existing.kind;
    let kindPatch: {
      kind?: SubscriptionKind;
      totalInstallments?: number | null;
      installmentsPaid?: number;
    } = {};
    if (
      dto.kind !== undefined ||
      dto.totalInstallments !== undefined
    ) {
      const fields = this.normalizeKindFields(
        nextKind,
        dto.totalInstallments !== undefined
          ? dto.totalInstallments
          : existing.totalInstallments,
      );
      kindPatch = {
        kind: fields.kind,
        totalInstallments: fields.totalInstallments,
      };
      if (fields.kind !== SubscriptionKind.INSTALLMENT) {
        kindPatch.installmentsPaid = 0;
      } else if (
        fields.totalInstallments != null &&
        existing.installmentsPaid > fields.totalInstallments
      ) {
        kindPatch.installmentsPaid = fields.totalInstallments;
      }
    }

    await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.amount !== undefined
          ? { amount: new Prisma.Decimal(dto.amount) }
          : {}),
        ...(dto.billingDay !== undefined
          ? { billingDay: clampBudgetStartDay(dto.billingDay) }
          : {}),
        ...kindPatch,
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId }
          : {}),
        ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.summary(householdId, userId);
  }

  async remove(householdId: string, userId: string, id: string) {
    await this.requireOwn(householdId, userId, id);
    const payments = await this.prisma.subscriptionPayment.count({
      where: { subscriptionId: id },
    });
    if (payments > 0) {
      await this.prisma.subscription.update({
        where: { id },
        data: { active: false },
      });
    } else {
      await this.prisma.subscription.delete({ where: { id } });
    }
    return this.summary(householdId, userId);
  }

  async pay(
    householdId: string,
    userId: string,
    id: string,
    dto: PaySubscriptionDto,
  ) {
    const sub = await this.requireOwn(householdId, userId, id);
    if (!sub.active) throw new BadRequestException('Commitment is archived');

    const ctx = await this.periodContext(userId);
    const existing = await this.prisma.subscriptionPayment.findUnique({
      where: {
        subscriptionId_periodKey: {
          subscriptionId: id,
          periodKey: ctx.periodKey,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Already paid for this period');
    }

    const accountId = dto.accountId ?? sub.accountId;
    await this.assertAccount(householdId, accountId);
    await this.assertCategory(householdId, sub.categoryId);

    const paidOn = dto.occurredOn
      ? new Date(dto.occurredOn)
      : new Date(ctx.today);
    const note =
      dto.note?.trim() ||
      `${this.notePrefix(sub.kind)}: ${sub.name} (${ctx.periodKey})`;

    const nextPaid =
      sub.kind === SubscriptionKind.INSTALLMENT
        ? sub.installmentsPaid + 1
        : sub.installmentsPaid;
    const complete =
      sub.kind === SubscriptionKind.INSTALLMENT &&
      sub.totalInstallments != null &&
      nextPaid >= sub.totalInstallments;

    await this.prisma.$transaction(async (db) => {
      const tx = await db.transaction.create({
        data: {
          householdId,
          userId,
          accountId,
          categoryId: sub.categoryId,
          type: 'EXPENSE',
          amount: sub.amount,
          occurredOn: paidOn,
          note,
        },
      });
      await db.subscriptionPayment.create({
        data: {
          subscriptionId: id,
          periodKey: ctx.periodKey,
          amount: sub.amount,
          paidOn,
          transactionId: tx.id,
        },
      });
      if (sub.kind === SubscriptionKind.INSTALLMENT) {
        await db.subscription.update({
          where: { id },
          data: {
            installmentsPaid: nextPaid,
            ...(complete ? { active: false } : {}),
          },
        });
      }
    });

    return this.summary(householdId, userId);
  }

  async unpay(householdId: string, userId: string, id: string) {
    const sub = await this.requireOwn(householdId, userId, id);
    const ctx = await this.periodContext(userId);
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: {
        subscriptionId_periodKey: {
          subscriptionId: id,
          periodKey: ctx.periodKey,
        },
      },
    });
    if (!payment) throw new NotFoundException('No payment this period');

    const nextPaid =
      sub.kind === SubscriptionKind.INSTALLMENT
        ? Math.max(0, sub.installmentsPaid - 1)
        : sub.installmentsPaid;
    const reopen =
      sub.kind === SubscriptionKind.INSTALLMENT &&
      !sub.active &&
      (sub.totalInstallments == null || nextPaid < sub.totalInstallments);

    await this.prisma.$transaction(async (db) => {
      await db.subscriptionPayment.delete({ where: { id: payment.id } });
      await db.transaction.delete({ where: { id: payment.transactionId } });
      if (sub.kind === SubscriptionKind.INSTALLMENT) {
        await db.subscription.update({
          where: { id },
          data: {
            installmentsPaid: nextPaid,
            ...(reopen ? { active: true } : {}),
          },
        });
      }
    });

    return this.summary(householdId, userId);
  }
}
