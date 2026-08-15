import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { isoLocal, monthRangeLocal } from '../common/calendar';

function monthRange() {
  return monthRangeLocal();
}

@Controller('households/:householdId/analytics')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('summary')
  summary(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.summary(membership, user.id);
  }

  @Get('savings')
  savings(@CurrentMembership() membership: MembershipContext) {
    return this.analytics.cashSavings(membership.householdId);
  }

  @Get('day')
  day(
    @CurrentMembership() membership: MembershipContext,
    @Query('on') on?: string,
  ) {
    return this.analytics.dayLog(membership, on ?? isoLocal(new Date()));
  }

  @Get('by-day')
  byDay(
    @CurrentMembership() membership: MembershipContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fallback = monthRange();
    return this.analytics.byDay(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
    );
  }

  @Get('by-category')
  byCategory(
    @CurrentMembership() membership: MembershipContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fallback = monthRange();
    return this.analytics.byCategory(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
    );
  }

  @Get('by-member')
  byMember(
    @CurrentMembership() membership: MembershipContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fallback = monthRange();
    return this.analytics.byMember(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
    );
  }
}
