import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LoansService } from './loans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateLoanDto } from './dto/create-loan.dto';
import { CreateRepaymentDto } from './dto/create-repayment.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';

@Controller('households/:householdId/loans')
@UseGuards(JwtAuthGuard, HouseholdGuard, HouseKindGuard)
export class LoansController {
  constructor(private loans: LoansService) {}

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
    @Body() dto: CreateLoanDto,
  ) {
    return this.loans.create(membership.householdId, user.id, dto);
  }

  @Patch(':loanId')
  update(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('loanId') loanId: string,
    @Body() dto: UpdateLoanDto,
  ) {
    return this.loans.update(membership.householdId, user.id, loanId, dto);
  }

  @Delete(':loanId')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('loanId') loanId: string,
  ) {
    return this.loans.remove(membership.householdId, user.id, loanId);
  }

  @Post(':loanId/repayments')
  repay(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('loanId') loanId: string,
    @Body() dto: CreateRepaymentDto,
  ) {
    return this.loans.repay(membership.householdId, user.id, loanId, dto);
  }
}
