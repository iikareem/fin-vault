import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipContext } from './membership-context';

@Injectable()
export class HouseholdAccessService {
  constructor(private prisma: PrismaService) {}

  async requireMember(
    userId: string,
    householdId: string,
  ): Promise<MembershipContext> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_householdId: { userId, householdId } },
      include: { household: true },
    });
    if (!membership) {
      throw new ForbiddenException('You are not in this household');
    }
    return {
      householdId: membership.householdId,
      role: membership.role,
      kind: membership.household.kind,
      currency: membership.household.currency,
      name: membership.household.name,
    };
  }

  async requireAdmin(userId: string, householdId: string) {
    const ctx = await this.requireMember(userId, householdId);
    if (ctx.role !== 'ADMIN') {
      throw new ForbiddenException('Only an admin can do this');
    }
    return ctx;
  }

  async requireHouse(userId: string, householdId: string) {
    const ctx = await this.requireMember(userId, householdId);
    if (ctx.kind !== 'HOUSE') {
      throw new ForbiddenException('This only applies to a shared house');
    }
    return ctx;
  }

  async paybackCategoryId(householdId: string) {
    const cat = await this.prisma.category.findFirst({
      where: { householdId, name: 'Member payback', kind: 'EXPENSE' },
    });
    if (!cat) throw new NotFoundException('Payback category is missing');
    return cat.id;
  }
}
