import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { AppAdminGuard } from './app-admin.guard';
import { AdminActivityService } from './admin-activity.service';

@Controller('admin/activity')
@UseGuards(JwtAuthGuard, AppAdminGuard)
export class AdminActivityController {
  constructor(private activity: AdminActivityService) {}

  @Get('members')
  members(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    return this.activity.listMembers(user.id, period);
  }
}
