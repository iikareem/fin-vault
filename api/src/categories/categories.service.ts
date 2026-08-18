import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { HouseholdKind } from '@prisma/client';
import { PERSONAL_EXPENSE } from '../households/space-defaults';

const HOUSE_PAID = [
  { name: 'Family gift', kind: 'EXPENSE' as const, color: '#db2777' },
  { name: 'Courtesy', kind: 'EXPENSE' as const, color: '#c026d3' },
];

/** Legacy names replaced by their new target names (keeps the category row). */
const RENAME: Record<string, string> = {
  Groceries: 'Consumables',
  Food: 'Nutrition',
  Gifts: 'Social occasions',
  Charity: 'Charity & sadaqah',
  Travel: 'Travel & trips',
  Clothes: 'Clothes & shoes',
  Restaurants: 'Dining & cafés',
  'Household errands': 'Durable purchases',
  'Other errands': 'Other durables',
  'Sports gear': 'Sports',
};

/** Source category is merged into the target, remapping rows then deleting. */
const MERGE: Record<string, string> = {
  Shoes: 'Clothes & shoes',
  Coffee: 'Dining & cafés',
  Home: 'Other home',
  Phone: 'Phone bills',
  'Personal grooming': 'Other care',
  'Other yearly': 'Other',
};

/** Categories moved under a group by group name. */
const REPARENT: Record<string, string> = {
  Electronics: 'Durable purchases',
  Beauty: 'Personal care',
  Consumables: 'Nutrition',
  Fuel: 'Transport',
  Cleaning: 'Hygiene',
  Pharmacy: 'Health',
  Snacks: 'Nutrition',
  'Phone bills': 'Bills',
  'Repairs & fixes': 'Home expenses',
  Licenses: 'Government fees',
  'Traffic fines': 'Government fees',
  Internet: 'Bills',
};

/** Categories removed entirely; their rows are remapped to Other. */
const DELETE_LIST = [
  'Pets',
  'Related expenses',
  'Yearly expenses',
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
      await this.syncPersonal(householdId);
    }
    return this.prisma.category.findMany({
      where: { householdId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Aligns a personal household's expense categories with the target tree. */
  private async syncPersonal(householdId: string) {
    const byName = (name: string) =>
      this.prisma.category.findFirst({
        where: { householdId, name, kind: 'EXPENSE' },
      });

    for (const [oldName, newName] of Object.entries(RENAME)) {
      const row = await byName(oldName);
      if (!row) continue;
      const target = await byName(newName);
      if (target) {
        await this.mergeCategory(row.id, target.id);
      } else {
        await this.prisma.category.update({
          where: { id: row.id },
          data: { name: newName },
        });
      }
    }

    const parents = PERSONAL_EXPENSE.filter((c) => !c.group);
    const children = PERSONAL_EXPENSE.filter((c) => c.group);
    const parentIds = new Map<string, string>();
    for (let i = 0; i < parents.length; i++) {
      const def = parents[i];
      const row = await this.prisma.category.upsert({
        where: {
          householdId_name_kind: {
            householdId,
            name: def.name,
            kind: 'EXPENSE',
          },
        },
        update: { color: def.color, sortOrder: i, parentId: null },
        create: {
          householdId,
          name: def.name,
          kind: 'EXPENSE',
          color: def.color,
          sortOrder: i,
        },
      });
      parentIds.set(def.name, row.id);
    }
    const orderInGroup = new Map<string, number>();
    for (const def of children) {
      const group = def.group;
      if (!group) continue;
      const parentId = parentIds.get(group);
      if (!parentId) continue;
      const order = orderInGroup.get(group) ?? 0;
      orderInGroup.set(group, order + 1);
      await this.prisma.category.upsert({
        where: {
          householdId_name_kind: {
            householdId,
            name: def.name,
            kind: 'EXPENSE',
          },
        },
        update: { color: def.color, parentId, sortOrder: order },
        create: {
          householdId,
          name: def.name,
          kind: 'EXPENSE',
          color: def.color,
          parentId,
          sortOrder: order,
        },
      });
    }

    for (const [sourceName, targetName] of Object.entries(MERGE)) {
      const source = await byName(sourceName);
      const target = await byName(targetName);
      if (source && target && source.id !== target.id) {
        await this.mergeCategory(source.id, target.id);
      }
    }

    for (const [childName, parentName] of Object.entries(REPARENT)) {
      const child = await byName(childName);
      const parent = await byName(parentName);
      if (child && parent && child.id !== parent.id) {
        await this.prisma.category.update({
          where: { id: child.id },
          data: { parentId: parent.id },
        });
      }
    }

    const other = await byName('Other');
    for (const name of DELETE_LIST) {
      const row = await byName(name);
      if (row && other && row.id !== other.id) {
        await this.prisma.category.updateMany({
          where: { parentId: row.id },
          data: { parentId: other.id },
        });
        await this.mergeCategory(row.id, other.id);
      }
    }
  }

  private async mergeCategory(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    await this.prisma.$transaction([
      this.prisma.transaction.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.houseClaim.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.houseCover.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.peerLoan.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      }),
      this.prisma.category.updateMany({
        where: { parentId: sourceId },
        data: { parentId: targetId },
      }),
      this.prisma.category.delete({ where: { id: sourceId } }),
    ]);
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
        parentId: dto.parentId ?? null,
      },
    });
  }
}