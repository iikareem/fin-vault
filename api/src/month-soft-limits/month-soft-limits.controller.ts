import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MonthSoftLimitsService } from './month-soft-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { UpsertMonthSoftLimitDto } from './dto/upsert-month-soft-limit.dto';

@Controller('households/:householdId/month-soft-limit')
@UseGuards(JwtAuthGuard, HouseholdGuard, PersonalKindGuard)
export class MonthSoftLimitsController {
  constructor(private softLimits: MonthSoftLimitsService) {}

  @Get()
  get(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    return this.softLimits.getStatus(
      membership.householdId,
      user.id,
      period || undefined,
    );
  }

  @Put()
  upsert(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertMonthSoftLimitDto,
  ) {
    return this.softLimits.upsert(membership.householdId, user.id, dto);
  }

  @Delete()
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    return this.softLimits.remove(
      membership.householdId,
      user.id,
      period || undefined,
    );
  }
}
