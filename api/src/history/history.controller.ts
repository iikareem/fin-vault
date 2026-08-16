import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';

@Controller('households/:householdId/history')
@UseGuards(JwtAuthGuard, HouseholdGuard, HouseKindGuard)
export class HistoryController {
  constructor(private history: HistoryService) {}

  @Get('with-member')
  withMember(
    @CurrentMembership() membership: MembershipContext,
    @Query('memberId') memberId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.history.withMember(
      membership.householdId,
      memberId,
      from,
      to,
    );
  }

  @Get('between')
  between(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Query('userA') userA: string,
    @Query('userB') userB: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.history.betweenMembers(
      membership.householdId,
      user.id,
      membership.role,
      userA,
      userB,
      from,
      to,
    );
  }
}
