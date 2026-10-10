import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { normalizeLoginEmail, normalizeLoginPassword } from './login-text';
import { seedPersonalSpace } from '../households/space-defaults';

function userPrefs(user: {
  preferredCurrency: string;
  theme: string;
  budgetMonthStartDay: number;
  showPersonalMonthSpend: boolean;
  hideBalances: boolean;
  reduceMotion: boolean;
  compactUi: boolean;
  locale: string;
}) {
  return {
    preferredCurrency: user.preferredCurrency,
    theme: user.theme,
    budgetMonthStartDay: user.budgetMonthStartDay,
    showPersonalMonthSpend: user.showPersonalMonthSpend,
    hideBalances: user.hideBalances,
    reduceMotion: user.reduceMotion,
    compactUi: user.compactUi,
    locale: user.locale === 'ar' ? 'ar' : 'en',
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const name = dto.name.trim();
    const email = normalizeLoginEmail(dto.email);
    const password = normalizeLoginPassword(dto.password);
    if (password.length < 8) {
      throw new UnauthorizedException(
        'Password must be at least 8 characters',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const nameAr = /[\u0600-\u06FF]/.test(name) ? name : '';
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          nameAr,
          email,
          passwordHash,
          preferredCurrency: 'EGP',
          theme: 'light',
          budgetMonthStartDay: 1,
          showPersonalMonthSpend: false,
          hideBalances: false,
          reduceMotion: false,
          compactUi: false,
          locale: 'en',
        },
      });
      await seedPersonalSpace(tx, created.id, name);
      return created;
    });

    const token = await this.issueToken(user.id);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        nameAr: user.nameAr,
        email: user.email,
        ...userPrefs(user),
      },
    };
  }

  async login(dto: LoginDto) {
    const email = normalizeLoginEmail(dto.email);
    const password = normalizeLoginPassword(dto.password);
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) throw new UnauthorizedException('Wrong email or password');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Wrong email or password');
    const token = await this.issueToken(user.id);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        nameAr: user.nameAr,
        email: user.email,
        ...userPrefs(user),
      },
    };
  }

  issueToken(userId: string) {
    return this.jwt.signAsync({ sub: userId });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new UnauthorizedException();
    const current = normalizeLoginPassword(dto.currentPassword);
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Wrong current password');
    const next = normalizeLoginPassword(dto.newPassword);
    if (next.length < 8) {
      throw new UnauthorizedException('New password must be at least 8 characters');
    }
    const hash = await bcrypt.hash(next, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });
    return { ok: true };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const data: {
      preferredCurrency?: string;
      theme?: string;
      budgetMonthStartDay?: number;
      showPersonalMonthSpend?: boolean;
      hideBalances?: boolean;
      reduceMotion?: boolean;
      compactUi?: boolean;
      locale?: string;
    } = {};
    if (dto.preferredCurrency) data.preferredCurrency = dto.preferredCurrency;
    if (dto.theme) data.theme = dto.theme;
    if (dto.budgetMonthStartDay != null) {
      data.budgetMonthStartDay = dto.budgetMonthStartDay;
    }
    if (dto.showPersonalMonthSpend != null) {
      data.showPersonalMonthSpend = dto.showPersonalMonthSpend;
    }
    if (dto.hideBalances != null) data.hideBalances = dto.hideBalances;
    if (dto.reduceMotion != null) data.reduceMotion = dto.reduceMotion;
    if (dto.compactUi != null) data.compactUi = dto.compactUi;
    if (dto.locale) data.locale = dto.locale;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: {
        memberships: { include: { household: true } },
      },
    });

    if (dto.preferredCurrency) {
      const personal = user.memberships.find(
        (m) => m.household.kind === 'PERSONAL',
      );
      if (personal) {
        await this.prisma.household.update({
          where: { id: personal.householdId },
          data: { currency: dto.preferredCurrency },
        });
      }
      const houseAdmin = user.memberships.find(
        (m) => m.household.kind === 'HOUSE' && m.role === 'ADMIN',
      );
      if (houseAdmin) {
        await this.prisma.household.update({
          where: { id: houseAdmin.householdId },
          data: { currency: dto.preferredCurrency },
        });
      }
    }

    return userPrefs(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { include: { household: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      name: user.name,
      nameAr: user.nameAr,
      email: user.email,
      ...userPrefs(user),
      spaces: user.memberships.map((m) => ({
        householdId: m.householdId,
        name: m.household.name,
        kind: m.household.kind,
        currency: m.household.currency,
        role: m.role,
      })),
    };
  }
}
