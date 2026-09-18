import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SavingsGoalsService } from './savings-goals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';
import { AllocateSavingsGoalDto } from './dto/allocate-savings-goal.dto';
import { MoveSavingsGoalDto } from './dto/move-savings-goal.dto';

@Controller('households/:householdId/savings-goals')
@UseGuards(JwtAuthGuard, HouseholdGuard, PersonalKindGuard)
export class SavingsGoalsController {
  constructor(private goals: SavingsGoalsService) {}

  @Get()
  summary(@CurrentMembership() membership: MembershipContext) {
    return this.goals.summary(membership.householdId);
  }

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSavingsGoalDto,
  ) {
    return this.goals.create(membership.householdId, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavingsGoalDto,
  ) {
    return this.goals.update(membership.householdId, user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.goals.remove(membership.householdId, user.id, id);
  }

  @Post(':id/allocate')
  allocate(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AllocateSavingsGoalDto,
  ) {
    return this.goals.allocate(membership.householdId, user.id, id, dto);
  }

  @Post(':id/release')
  release(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoveSavingsGoalDto,
  ) {
    return this.goals.release(membership.householdId, user.id, id, dto);
  }

  @Post(':id/to-current')
  toCurrent(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoveSavingsGoalDto,
  ) {
    return this.goals.toCurrent(membership.householdId, user.id, id, dto);
  }
}
