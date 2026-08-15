import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list(householdId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { householdId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      relation: m.user.relation,
      role: m.role,
      createdAt: m.user.createdAt,
    }));
  }

  create() {
    throw new ForbiddenException('The family is fixed. Nobody can add or change people.');
  }
}
