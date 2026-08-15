import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreatePayoutDto } from './dto/create-payout.dto';

@Controller('households/:householdId/payouts')
@UseGuards(JwtAuthGuard, HouseholdGuard, HouseKindGuard, HouseholdAdminGuard)
export class PayoutsController {
  constructor(private payouts: PayoutsService) {}

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.payouts.create(membership.householdId, user.id, dto);
  }
}
