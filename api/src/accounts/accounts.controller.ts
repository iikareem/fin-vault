import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { MembershipContext } from '../households/membership-context';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller('households/:householdId/accounts')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @Get()
  list(@CurrentMembership() membership: MembershipContext) {
    return this.accounts.list(membership.householdId);
  }

  @Post()
  @UseGuards(HouseholdAdminGuard)
  create(
    @CurrentMembership() membership: MembershipContext,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accounts.create(membership.householdId, dto);
  }
}
