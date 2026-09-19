import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { HouseholdKind } from '@prisma/client';
import { PERSONAL_EXPENSE } from '../households/space-defaults';
import { nameArFor } from './category-labels';

const HOUSE_PAID = [
  { name: 'Family gift', kind: 'EXPENSE' as const, color: '#db2777' },
  { name: 'Courtesy', kind: 'EXPENSE' as const, color: '#c026d3' },
];

/** Legacy names replaced by their new target names (keeps the category row). */
const RENAME: Record<string, string> = {
  Groceries: 'Home food',
  Nutrition: 'Food',
  Consumables: 'Home food',
  Gifts: 'Social occasions',
  Charity: 'Charity & sadaqah',
  Travel: 'Travel & trips',
  Clothes: 'Clothes & shoes',
  Restaurants: 'Dining & cafés',
  'Household errands': 'Shopping',
  'Durable purchases': 'Shopping',
  'Home expenses': 'Housing',
  'Other errands': 'Other shopping',
  'Other durables': 'Other shopping',
  'Sports gear': 'Sports',
  'Other children': 'Other family',
  'Debt repayment': 'Loan repayment',
};

/** Source category is merged into the target, remapping rows then deleting. */
const MERGE: Record<string, string> = {
  Shoes: 'Clothes & shoes',
  Coffee: 'Dining & cafés',
  Home: 'Other home',
  Phone: 'Phone bills',
  'Personal grooming': 'Other care',
  'Other yearly': 'Other',
  Snacks: 'Supermarket food',
  Hygiene: 'Personal care',
  Children: 'Family',
  /** Collapse old Debts / سلفة شخصية labels into the single رد سلفة category. */
  'Other debts': 'Loan repayment',
  Debts: 'Loan repayment',
  'Personal loan': 'Loan repayment',
};

/** Categories moved under a group by group name. */
const REPARENT: Record<string, string> = {
  'Home food': 'Food',
  'Dining & cafés': 'Food',
  'Supermarket food': 'Food',
  'Other food': 'Food',
  'Supermarket cleaning': 'Supermarket',
  'Supermarket household': 'Supermarket',
  'Other supermarket': 'Supermarket',
  Electricity: 'Bills',
  Water: 'Bills',
  Gas: 'Bills',
  'Phone bills': 'Bills',
  Internet: 'Bills',
  'Other bills': 'Bills',
  Rent: 'Housing',
  Insurance: 'Housing',
  'Home decor': 'Housing',
  'Facility maintenance': 'Housing',
  'Appliance repair': 'Housing',
  'Repairs & fixes': 'Housing',
  'Other home': 'Housing',
  Fuel: 'Transport',
  'Car maintenance': 'Transport',
  'Car installments': 'Transport',
  Rides: 'Transport',
  'Other transport': 'Transport',
  'Clothes & shoes': 'Shopping',
  Electronics: 'Shopping',
  'Electrical appliances': 'Shopping',
  Furniture: 'Shopping',
  Lamps: 'Shopping',
  'Other shopping': 'Shopping',
  'Doctor visit': 'Health',
  Medicines: 'Health',
  Pharmacy: 'Health',
  'Lab tests': 'Health',
  'Other health': 'Health',
  Beauty: 'Personal care',
  Haircut: 'Personal care',
  Cleaning: 'Personal care',
  'Other care': 'Personal care',
  'Pocket money': 'Family',
  'School needs': 'Family',
  Education: 'Family',
  'Family support': 'Family',
  'Social occasions': 'Family',
  'Other family': 'Family',
  Entertainment: 'Lifestyle',
  Sports: 'Lifestyle',
  Subscriptions: 'Lifestyle',
  'Other lifestyle': 'Lifestyle',
  'Travel tickets': 'Travel & trips',
  'Travel procedures': 'Travel & trips',
  'Local trips': 'Travel & trips',
  'Summer resort': 'Travel & trips',
  'Other travel': 'Travel & trips',
  'Ongoing sadaqah': 'Charity & sadaqah',
  Mosque: 'Charity & sadaqah',
  Zakat: 'Charity & sadaqah',
  Sadaqah: 'Charity & sadaqah',
  'Help someone': 'Charity & sadaqah',
  'Other charity': 'Charity & sadaqah',
  'Apartment installments': 'Installments',
  'Other installments': 'Installments',
  Licenses: 'Government fees',
  'Traffic fines': 'Government fees',
  'Other government': 'Government fees',
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

  async list(householdId: string, kind: HouseholdKind, userId: string) {
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
          update: { nameAr: nameArFor(cat.name) },
          create: {
            householdId,
            ...cat,
            nameAr: nameArFor(cat.name),
          },
        });
      }
    }
    if (kind === 'PERSONAL') {
      await this.syncPersonal(householdId);
    }
    await this.fillMissingNameAr(householdId);
    const cats = await this.prisma.category.findMany({
      where: { householdId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.orderByUserUsage(householdId, userId, cats);
  }

  /** Backfill Arabic labels for known English category names. */
  private async fillMissingNameAr(householdId: string) {
    const cats = await this.prisma.category.findMany({
      where: { householdId, nameAr: '' },
      select: { id: true, name: true },
    });
    for (const cat of cats) {
      const ar = nameArFor(cat.name);
      if (!ar) continue;
      await this.prisma.category.update({
        where: { id: cat.id },
        data: { nameAr: ar },
      });
    }
  }

  /** Most-used categories for this user float to the top (groups and subs). */
  private async orderByUserUsage<
    T extends { id: string; parentId: string | null; sortOrder: number; name: string },
  >(householdId: string, userId: string, cats: T[]): Promise<T[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { householdId, userId },
      _count: { _all: true },
    });
    const countById = new Map(
      grouped.map((row) => [row.categoryId, row._count._all]),
    );
    const score = (id: string) => countById.get(id) ?? 0;

    const parents = cats.filter((c) => !c.parentId);
    const children = cats.filter((c) => c.parentId);
    const kidsOf = (parentId: string) =>
      children
        .filter((c) => c.parentId === parentId)
        .sort(
          (a, b) =>
            score(b.id) - score(a.id) ||
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name),
        );

    const parentScore = (p: T) => {
      const kids = children.filter((c) => c.parentId === p.id);
      if (!kids.length) return score(p.id);
      return (
        score(p.id) + kids.reduce((sum, k) => sum + score(k.id), 0)
      );
    };

    parents.sort(
      (a, b) =>
        parentScore(b) - parentScore(a) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );

    const ordered: T[] = [];
    for (const parent of parents) {
      ordered.push(parent);
      ordered.push(...kidsOf(parent.id));
    }
    return ordered;
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
        update: {
          color: def.color,
          sortOrder: i,
          parentId: null,
          nameAr: nameArFor(def.name),
        },
        create: {
          householdId,
          name: def.name,
          nameAr: nameArFor(def.name),
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
        update: {
          color: def.color,
          parentId,
          sortOrder: order,
          nameAr: nameArFor(def.name),
        },
        create: {
          householdId,
          name: def.name,
          nameAr: nameArFor(def.name),
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

    /** رد سلفة stays a single top-level category — no group, no children. */
    const loanRepayment = await byName('Loan repayment');
    if (loanRepayment) {
      await this.prisma.category.update({
        where: { id: loanRepayment.id },
        data: { parentId: null },
      });
      const strayKids = await this.prisma.category.findMany({
        where: { householdId, parentId: loanRepayment.id, kind: 'EXPENSE' },
      });
      for (const kid of strayKids) {
        await this.mergeCategory(kid.id, loanRepayment.id);
      }

      /** Any leftover «سلفة شخصية» in personal books → رد سلفة. */
      const personalLoanRows = await this.prisma.category.findMany({
        where: { householdId, name: 'Personal loan' },
      });
      for (const row of personalLoanRows) {
        if (row.id === loanRepayment.id) continue;
        await this.mergeCategory(row.id, loanRepayment.id);
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
        nameAr: dto.nameAr?.trim() || nameArFor(dto.name),
        kind: dto.kind,
        color: dto.color ?? '#2563eb',
        parentId: dto.parentId ?? null,
      },
    });
  }
}