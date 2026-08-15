import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { HouseholdKind } from '@prisma/client';
import { PERSONAL_EXPENSE } from '../households/space-defaults';

const HOUSE_PAID = [
  { name: 'Family gift', kind: 'EXPENSE' as const, color: '#db2777' },
  { name: 'Courtesy', kind: 'EXPENSE' as const, color: '#c026d3' },
];

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async list(householdId: string, kind: HouseholdKind) {
    await this.mergeLegacyGift(householdId);
    if (kind === 'HOUSE') {
      for (const cat of HOUSE_PAID) {
        await this.prisma.category.upsert({
          where: {
            householdId_name_kind: {
              householdId,
              name: cat.name,
              kind: cat.kind,
            },
          },
          update: {},
          create: { householdId, ...cat },
        });
      }
    }
    if (kind === 'PERSONAL') {
      for (const cat of PERSONAL_EXPENSE) {
        await this.prisma.category.upsert({
          where: {
            householdId_name_kind: {
              householdId,
              name: cat.name,
              kind: 'EXPENSE',
            },
          },
          update: {},
          create: {
            householdId,
            name: cat.name,
            kind: 'EXPENSE',
            color: cat.color,
          },
        });
      }
    }
    return this.prisma.category.findMany({
      where: { householdId },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  private async mergeLegacyGift(householdId: string) {
    const legacy = await this.prisma.category.findMany({
      where: { householdId, name: 'Gift from Toti' },
    });
    for (const old of legacy) {
      let next = await this.prisma.category.findUnique({
        where: {
          householdId_name_kind: {
            householdId,
            name: 'Family gift',
            kind: old.kind,
          },
        },
      });
      if (!next) {
        await this.prisma.category.update({
          where: { id: old.id },
          data: { name: 'Family gift' },
        });
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.transaction.updateMany({
          where: { categoryId: old.id },
          data: { categoryId: next.id },
        }),
        this.prisma.houseClaim.updateMany({
          where: { categoryId: old.id },
          data: { categoryId: next.id },
        }),
        this.prisma.peerLoan.updateMany({
          where: { categoryId: old.id },
          data: { categoryId: next.id },
        }),
        this.prisma.category.delete({ where: { id: old.id } }),
      ]);
    }
  }

  create(householdId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        householdId,
        name: dto.name,
        kind: dto.kind,
        color: dto.color ?? '#2563eb',
      },
    });
  }
}
