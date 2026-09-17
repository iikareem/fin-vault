import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OutsideLoansService } from './outside-loans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateOutsideLoanDto } from './dto/create-outside-loan.dto';
import { CollectOutsideLoanDto } from './dto/collect-outside-loan.dto';

@Controller('households/:householdId/outside-loans')
@UseGuards(JwtAuthGuard, HouseholdGuard, PersonalKindGuard)
export class OutsideLoansController {
  constructor(private loans: OutsideLoansService) {}

  @Get()
  list(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.loans.list(membership.householdId, user.id);
  }

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOutsideLoanDto,
  ) {
    return this.loans.create(membership.householdId, user.id, dto);
  }

  @Post(':id/collect')
  collect(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CollectOutsideLoanDto,
  ) {
    return this.loans.collect(membership.householdId, user.id, id, dto);
  }
}
