import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CharityService } from './charity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { HouseKindGuard } from '../households/house-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateCharityTypeDto } from './dto/create-charity-type.dto';
import { UpdateCharityTypeDto } from './dto/update-charity-type.dto';
import { CreateCharityGiftDto } from './dto/create-charity-gift.dto';
import { UpdateCharityGiftDto } from './dto/update-charity-gift.dto';

@Controller('households/:householdId/charity')
@UseGuards(JwtAuthGuard, HouseholdGuard, HouseKindGuard)
export class CharityController {
  constructor(private charity: CharityService) {}

  @Get()
  month(
    @CurrentMembership() membership: MembershipContext,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.charity.month(membership.householdId, month ?? fallback);
  }

  @Post('types')
  @UseGuards(HouseholdAdminGuard)
  createType(
    @CurrentMembership() membership: MembershipContext,
    @Body() dto: CreateCharityTypeDto,
  ) {
    return this.charity.createType(membership.householdId, dto);
  }

  @Patch('types/:typeId')
  @UseGuards(HouseholdAdminGuard)
  updateType(
    @CurrentMembership() membership: MembershipContext,
    @Param('typeId') typeId: string,
    @Body() dto: UpdateCharityTypeDto,
  ) {
    return this.charity.updateType(membership.householdId, typeId, dto);
  }

  @Post('gifts')
  contribute(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCharityGiftDto,
  ) {
    return this.charity.contribute(
      membership.householdId,
      user.id,
      membership.role,
      dto,
    );
  }

  @Patch('gifts/:giftId')
  updateGift(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('giftId') giftId: string,
    @Body() dto: UpdateCharityGiftDto,
  ) {
    return this.charity.updateGift(
      membership.householdId,
      user.id,
      membership.role,
      giftId,
      dto,
    );
  }

  @Delete('gifts/:giftId')
  removeGift(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('giftId') giftId: string,
  ) {
    return this.charity.removeGift(
      membership.householdId,
      user.id,
      membership.role,
      giftId,
    );
  }
}
