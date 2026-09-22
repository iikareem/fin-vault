import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ManageCreateCategoryDto } from './dto/manage-create-category.dto';
import { ManageUpdateCategoryDto } from './dto/manage-update-category.dto';
import { CategoryKind, HouseholdKind } from '@prisma/client';
import { PERSONAL_EXPENSE } from '../households/space-defaults';
import { nameArFor } from './category-labels';
import { NON_SPEND_CATEGORY_NAMES } from './non-spend-categories';

/** Built-ins whose English name must stay for system matching. */
const PROTECTED_SEED_KEYS = new Set<string>([
  ...NON_SPEND_CATEGORY_NAMES,
  'Other',
  'Salary',
  'Loan repayment',
  'Loan collected',
  'Loan received',
  'Outside loan',
  'Loan repaid',
  'Member payback',
  'Given to member',
  'Allowance',
]);

const ACCENT_FALLBACK = '#0f766e';

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
      where: { householdId, hidden: false },
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
    const parentHidden = new Map<string, boolean>();
    for (let i = 0; i < parents.length; i++) {
      const def = parents[i];
      const row = await this.ensureSeededCategory(householdId, {
        seedKey: def.name,
        name: def.name,
        color: def.color,
        sortOrder: i,
        parentId: null,
      });
      parentIds.set(def.name, row.id);
      parentHidden.set(def.name, row.hidden);
    }
    const orderInGroup = new Map<string, number>();
    for (const def of children) {
      const group = def.group;
      if (!group) continue;
      // User removed this group — don't resurrect its subcategories.
      if (parentHidden.get(group)) continue;
      const parentId = parentIds.get(group);
      if (!parentId) continue;
      const order = orderInGroup.get(group) ?? 0;
      orderInGroup.set(group, order + 1);
      await this.ensureSeededCategory(householdId, {
        seedKey: def.name,
        name: def.name,
        color: def.color,
        sortOrder: order,
        parentId,
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
        seedKey: null,
        isUserManaged: true,
      },
    });
  }

  /**
   * Upsert a built-in category by seedKey. Never overwrites user-managed
   * display fields — each personal household keeps its own edits.
   */
  private async ensureSeededCategory(
    householdId: string,
    def: {
      seedKey: string;
      name: string;
      color: string;
      sortOrder: number;
      parentId: string | null;
    },
  ) {
    const existing =
      (await this.prisma.category.findFirst({
        where: { householdId, seedKey: def.seedKey, kind: 'EXPENSE' },
      })) ??
      (await this.prisma.category.findFirst({
        where: {
          householdId,
          name: def.name,
          kind: 'EXPENSE',
          seedKey: null,
        },
      })) ??
      (await this.prisma.category.findFirst({
        where: { householdId, name: def.name, kind: 'EXPENSE' },
      }));

    if (!existing) {
      return this.prisma.category.create({
        data: {
          householdId,
          name: def.name,
          nameAr: nameArFor(def.name),
          kind: 'EXPENSE',
          color: def.color,
          sortOrder: def.sortOrder,
          parentId: def.parentId,
          seedKey: def.seedKey,
          isUserManaged: false,
        },
      });
    }

    if (existing.isUserManaged) {
      if (existing.seedKey !== def.seedKey) {
        return this.prisma.category.update({
          where: { id: existing.id },
          data: { seedKey: def.seedKey },
        });
      }
      return existing;
    }

    return this.prisma.category.update({
      where: { id: existing.id },
      data: {
        seedKey: def.seedKey,
        color: def.color,
        sortOrder: def.sortOrder,
        parentId: def.parentId,
        nameAr: existing.nameAr || nameArFor(def.name),
      },
    });
  }

  async manageList(householdId: string) {
    await this.syncPersonal(householdId);
    await this.fillMissingNameAr(householdId);
    const cats = await this.prisma.category.findMany({
      where: { householdId, hidden: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        nameAr: true,
        color: true,
        emoji: true,
        kind: true,
        parentId: true,
        sortOrder: true,
        seedKey: true,
        isUserManaged: true,
        _count: { select: { children: true, txs: true } },
      },
    });

    return cats.map((c) => {
      const seed = c.seedKey ?? c.name;
      const protectedName = PROTECTED_SEED_KEYS.has(seed);
      const isCustom = !c.seedKey;
      return {
        id: c.id,
        name: c.name,
        nameAr: c.nameAr,
        color: c.color,
        emoji: c.emoji || '',
        kind: c.kind,
        parentId: c.parentId,
        sortOrder: c.sortOrder,
        seedKey: c.seedKey,
        isUserManaged: c.isUserManaged || isCustom,
        isCustom,
        protected: protectedName,
        canRename: !protectedName,
        // Personal books only — any non-system category/subcategory.
        canDelete: !protectedName,
        childCount: c._count.children,
        txCount: c._count.txs,
      };
    });
  }

  async manageCreate(householdId: string, dto: ManageCreateCategoryDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name required');
    const kind: CategoryKind = dto.kind ?? 'EXPENSE';
    const nameAr = dto.nameAr?.trim() || nameArFor(name) || '';
    const color = dto.color ?? ACCENT_FALLBACK;

    let parentId: string | null = dto.parentId?.trim() || null;
    if (parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: parentId, householdId, kind },
      });
      if (!parent) throw new BadRequestException('Parent category not found');
      if (parent.parentId) {
        throw new BadRequestException('Subcategories cannot have children');
      }
    }

    const clash = await this.prisma.category.findFirst({
      where: { householdId, name, kind },
    });
    if (clash) throw new BadRequestException('A category with this name already exists');

    const maxSort = await this.prisma.category.aggregate({
      where: { householdId, parentId, kind },
      _max: { sortOrder: true },
    });

    return this.prisma.category.create({
      data: {
        householdId,
        name,
        nameAr,
        kind,
        color,
        emoji: (dto.emoji ?? '').trim().slice(0, 16),
        parentId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        seedKey: null,
        isUserManaged: true,
      },
    });
  }

  async manageUpdate(
    householdId: string,
    categoryId: string,
    dto: ManageUpdateCategoryDto,
  ) {
    const cat = await this.prisma.category.findFirst({
      where: { id: categoryId, householdId },
    });
    if (!cat) throw new NotFoundException('Category not found');

    const seed = cat.seedKey ?? cat.name;
    const protectedName = PROTECTED_SEED_KEYS.has(seed);

    const data: {
      name?: string;
      nameAr?: string;
      color?: string;
      emoji?: string;
      parentId?: string | null;
      isUserManaged: boolean;
    } = { isUserManaged: true };

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name required');
      if (protectedName && name !== cat.name) {
        throw new ForbiddenException(
          'This system category name cannot be changed',
        );
      }
      if (name !== cat.name) {
        const clash = await this.prisma.category.findFirst({
          where: {
            householdId,
            name,
            kind: cat.kind,
            NOT: { id: cat.id },
          },
        });
        if (clash) {
          throw new BadRequestException('A category with this name already exists');
        }
        data.name = name;
      }
    }

    if (dto.nameAr !== undefined) {
      data.nameAr = dto.nameAr.trim();
    }

    if (dto.color !== undefined) {
      data.color = dto.color;
    }

    if (dto.emoji !== undefined) {
      data.emoji = dto.emoji.trim().slice(0, 16);
    }

    if (dto.parentId !== undefined) {
      const raw = dto.parentId;
      const parentId =
        raw === null || raw === '' ? null : String(raw).trim() || null;
      if (parentId === cat.id) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      if (parentId) {
        const parent = await this.prisma.category.findFirst({
          where: { id: parentId, householdId, kind: cat.kind },
        });
        if (!parent) throw new BadRequestException('Parent category not found');
        if (parent.parentId) {
          throw new BadRequestException('Subcategories cannot have children');
        }
        const kidCount = await this.prisma.category.count({
          where: { parentId: cat.id },
        });
        if (kidCount > 0) {
          throw new BadRequestException(
            'Move or remove subcategories before nesting this group',
          );
        }
      }
      data.parentId = parentId;
    }

    return this.prisma.category.update({
      where: { id: cat.id },
      data,
    });
  }

  async manageDelete(householdId: string, categoryId: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id: categoryId, householdId, hidden: false },
    });
    if (!cat) throw new NotFoundException('Category not found');

    const seed = cat.seedKey ?? cat.name;
    if (PROTECTED_SEED_KEYS.has(seed)) {
      throw new ForbiddenException('This system category cannot be deleted');
    }

    const children = await this.prisma.category.findMany({
      where: { householdId, parentId: cat.id, hidden: false },
      select: { id: true },
    });
    // Cascade: remove subcategories first (same personal household only).
    for (const child of children) {
      await this.manageDelete(householdId, child.id);
    }

    const other = await this.ensureOtherCategory(householdId, cat.kind);
    if (other.id === cat.id) {
      throw new ForbiddenException('This system category cannot be deleted');
    }

    if (cat.seedKey) {
      // Soft-hide seeded rows so sync does not recreate them for this user.
      await this.remapCategoryRefs(cat.id, other.id);
      await this.prisma.category.update({
        where: { id: cat.id },
        data: {
          hidden: true,
          isUserManaged: true,
          parentId: null,
        },
      });
      return { ok: true, remappedTo: other.id, hidden: true };
    }

    await this.mergeCategory(cat.id, other.id);
    return { ok: true, remappedTo: other.id };
  }

  /** Fallback bucket for remapping spends when a category is removed. */
  private async ensureOtherCategory(householdId: string, kind: CategoryKind) {
    const existing = await this.prisma.category.findFirst({
      where: {
        householdId,
        kind,
        OR: [{ seedKey: 'Other' }, { name: 'Other' }],
      },
    });
    if (existing) {
      if (existing.hidden) {
        return this.prisma.category.update({
          where: { id: existing.id },
          data: { hidden: false, isUserManaged: true, parentId: null },
        });
      }
      return existing;
    }

    return this.prisma.category.create({
      data: {
        householdId,
        name: 'Other',
        nameAr: nameArFor('Other'),
        kind,
        color: '#78716c',
        sortOrder: 999,
        parentId: null,
        seedKey: 'Other',
        isUserManaged: true,
        hidden: false,
      },
    });
  }

  private async remapCategoryRefs(sourceId: string, targetId: string) {
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
    ]);
  }
}
