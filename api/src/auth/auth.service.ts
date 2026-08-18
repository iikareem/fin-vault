import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { normalizeLoginEmail, normalizeLoginPassword } from './login-text';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

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
        email: user.email,
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
      email: user.email,
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
