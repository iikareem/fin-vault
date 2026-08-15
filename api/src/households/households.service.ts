import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HouseholdsService {
  constructor(private prisma: PrismaService) {}

  async listSpaces(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { household: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      householdId: m.householdId,
      name: m.household.name,
      kind: m.household.kind,
      currency: m.household.currency,
      role: m.role,
    }));
  }

  createHouse() {
    throw new ForbiddenException('The family house is fixed. Nobody can add another.');
  }
}
