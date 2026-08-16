import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CoversService } from './covers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateCoverDto } from './dto/create-cover.dto';
import { CreateCoverRepaymentDto } from './dto/create-cover-repayment.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';

@Controller('households/:householdId/covers')
@UseGuards(JwtAuthGuard, HouseholdGuard, HouseKindGuard)
export class CoversController {
  constructor(private covers: CoversService) {}

  @Get()
  list(@CurrentMembership() membership: MembershipContext) {
    return this.covers.list(membership.householdId);
  }

  @Post()
  @UseGuards(HouseholdAdminGuard)
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCoverDto,
  ) {
    return this.covers.create(membership.householdId, user.id, dto);
  }

  @Patch(':coverId')
  update(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('coverId') coverId: string,
    @Body() dto: UpdateCoverDto,
  ) {
    return this.covers.update(
      membership.householdId,
      user.id,
      membership.role,
      coverId,
      dto,
    );
  }

  @Delete(':coverId')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('coverId') coverId: string,
  ) {
    return this.covers.remove(
      membership.householdId,
      user.id,
      membership.role,
      coverId,
    );
  }

  @Post(':coverId/repayments')
  repay(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('coverId') coverId: string,
    @Body() dto: CreateCoverRepaymentDto,
  ) {
    return this.covers.repay(
      membership.householdId,
      user.id,
      membership.role,
      coverId,
      dto,
    );
  }
}
