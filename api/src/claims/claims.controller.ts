import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateClaimDto } from './dto/create-claim.dto';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';

@Controller('households/:householdId/claims')
@UseGuards(JwtAuthGuard, HouseholdGuard, HouseKindGuard)
export class ClaimsController {
  constructor(private claims: ClaimsService) {}

  @Get()
  list(@CurrentMembership() membership: MembershipContext) {
    return this.claims.list(membership.householdId);
  }

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateClaimDto,
  ) {
    return this.claims.create(membership.householdId, user.id, dto);
  }

  @Patch(':claimId')
  update(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('claimId') claimId: string,
    @Body() dto: UpdateClaimDto,
  ) {
    return this.claims.update(
      membership.householdId,
      user.id,
      membership.role,
      claimId,
      dto,
    );
  }

  @Delete(':claimId')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('claimId') claimId: string,
  ) {
    return this.claims.remove(
      membership.householdId,
      user.id,
      membership.role,
      claimId,
    );
  }

  @Post(':claimId/reimbursements')
  @UseGuards(HouseholdAdminGuard)
  reimburse(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('claimId') claimId: string,
    @Body() dto: CreateReimbursementDto,
  ) {
    return this.claims.reimburse(
      membership.householdId,
      user.id,
      claimId,
      dto,
    );
  }
}
