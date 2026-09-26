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
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { PaySubscriptionDto } from './dto/pay-subscription.dto';

@Controller('households/:householdId/subscriptions')
@UseGuards(JwtAuthGuard, HouseholdGuard, PersonalKindGuard)
export class SubscriptionsController {
  constructor(private subscriptions: SubscriptionsService) {}

  @Get()
  summary(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.subscriptions.summary(membership.householdId, user.id);
  }

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptions.create(membership.householdId, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptions.update(membership.householdId, user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.subscriptions.remove(membership.householdId, user.id, id);
  }

  @Post(':id/pay')
  pay(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PaySubscriptionDto,
  ) {
    return this.subscriptions.pay(membership.householdId, user.id, id, dto);
  }

  @Post(':id/unpay')
  unpay(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.subscriptions.unpay(membership.householdId, user.id, id);
  }
}
