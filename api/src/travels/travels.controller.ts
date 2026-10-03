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
import { TravelsService } from './travels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateTravelDto } from './dto/create-travel.dto';
import { UpdateTravelDto } from './dto/update-travel.dto';
import { AddTravelSpendDto } from './dto/add-travel-spend.dto';

@Controller('households/:householdId/travels')
@UseGuards(JwtAuthGuard, HouseholdGuard, PersonalKindGuard)
export class TravelsController {
  constructor(private travels: TravelsService) {}

  @Get()
  list(@CurrentMembership() membership: MembershipContext) {
    return this.travels.list(membership.householdId);
  }

  @Get(':travelId')
  get(
    @CurrentMembership() membership: MembershipContext,
    @Param('travelId') travelId: string,
  ) {
    return this.travels.get(membership.householdId, travelId);
  }

  @Post()
  create(
    @CurrentMembership() membership: MembershipContext,
    @Body() dto: CreateTravelDto,
  ) {
    return this.travels.create(membership.householdId, dto);
  }

  @Patch(':travelId')
  update(
    @CurrentMembership() membership: MembershipContext,
    @Param('travelId') travelId: string,
    @Body() dto: UpdateTravelDto,
  ) {
    return this.travels.update(membership.householdId, travelId, dto);
  }

  @Post(':travelId/end')
  end(
    @CurrentMembership() membership: MembershipContext,
    @Param('travelId') travelId: string,
  ) {
    return this.travels.end(membership.householdId, travelId);
  }

  @Delete(':travelId')
  remove(
    @CurrentMembership() membership: MembershipContext,
    @Param('travelId') travelId: string,
  ) {
    return this.travels.remove(membership.householdId, travelId);
  }

  @Post(':travelId/spends')
  addSpend(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Param('travelId') travelId: string,
    @Body() dto: AddTravelSpendDto,
  ) {
    return this.travels.addSpend(
      membership.householdId,
      user.id,
      travelId,
      dto,
    );
  }
}
