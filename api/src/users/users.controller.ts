import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { MembershipContext } from '../households/membership-context';

@Controller('households/:householdId/users')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@CurrentMembership() membership: MembershipContext) {
    return this.users.list(membership.householdId);
  }

  @Post()
  @UseGuards(HouseKindGuard, HouseholdAdminGuard)
  create() {
    return this.users.create();
  }
}
