import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { budgetMonthRange, isoLocal, monthRangeLocal } from '../common/calendar';

@Controller('households/:householdId/analytics')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  private async periodFallback(
    membership: MembershipContext,
    userId: string,
  ) {
    if (membership.kind !== 'PERSONAL') return monthRangeLocal();
    const startDay = await this.analytics.resolveBudgetStartDay(
      membership,
      userId,
    );
    const range = budgetMonthRange(new Date(), startDay);
    return { from: range.from, to: range.to };
  }

  @Get('summary')
  summary(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.summary(membership, user.id);
  }

  @Get('savings')
  async savings(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
  ) {
    const startDay = await this.analytics.resolveBudgetStartDay(
      membership,
      user.id,
    );
    return this.analytics.cashSavings(membership.householdId, startDay);
  }

  @Get('day')
  day(
    @CurrentMembership() membership: MembershipContext,
    @Query('on') on?: string,
  ) {
    return this.analytics.dayLog(membership, on ?? isoLocal(new Date()));
  }

  @Get('by-day')
  async byDay(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fallback = await this.periodFallback(membership, user.id);
    return this.analytics.byDay(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
    );
  }

  @Get('by-category')
  async byCategory(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('excludeCommitments') excludeCommitments?: string,
  ) {
    const fallback = await this.periodFallback(membership, user.id);
    return this.analytics.byCategory(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
      {
        excludeCommitments:
          excludeCommitments === '1' || excludeCommitments === 'true',
      },
    );
  }

  @Get('by-member')
  async byMember(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fallback = await this.periodFallback(membership, user.id);
    return this.analytics.byMember(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
    );
  }

  @Get('category-log')
  async categoryLog(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('excludeCommitments') excludeCommitments?: string,
    @Query('leaf') leaf?: string,
  ) {
    const fallback = await this.periodFallback(membership, user.id);
    const ids = (categoryIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.analytics.categoryLog(
      membership,
      from ?? fallback.from,
      to ?? fallback.to,
      ids,
      {
        excludeCommitments:
          excludeCommitments === '1' || excludeCommitments === 'true',
        leafCategoryId: leaf?.trim() || undefined,
      },
    );
  }
}
