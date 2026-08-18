import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './auth-user';

const SESSION_DAYS = 90;
const SESSION_MS = 1000 * 60 * 60 * 24 * SESSION_DAYS;

function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);
    res.cookie('fb_token', result.token, sessionCookieOptions());
    return result.user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('fb_token', {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.auth.me(user.id);
    // Sliding session: renew cookie while the user stays active.
    const token = await this.auth.issueToken(user.id);
    res.cookie('fb_token', token, sessionCookieOptions());
    return profile;
  }
}
