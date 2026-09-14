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
import { GoldService } from './gold.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateGoldHoldingDto } from './dto/create-gold-holding.dto';
import { UpdateGoldHoldingDto } from './dto/update-gold-holding.dto';

@Controller('households/:householdId/gold')
@UseGuards(JwtAuthGuard, HouseholdGuard, PersonalKindGuard)
export class GoldController {
  constructor(private gold: GoldService) {}

  @Get()
  summary(@CurrentMembership() membership: MembershipContext) {
    return this.gold.summary(membership.householdId);
  }

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateGoldHoldingDto,
  ) {
    return this.gold.create(membership.householdId, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGoldHoldingDto,
  ) {
    return this.gold.update(membership.householdId, user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.gold.remove(membership.householdId, user.id, id);
  }
}
