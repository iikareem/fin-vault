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
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { PersonalKindGuard } from '../households/personal-kind.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ManageCreateCategoryDto } from './dto/manage-create-category.dto';
import { ManageUpdateCategoryDto } from './dto/manage-update-category.dto';

@Controller('households/:householdId/categories')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categories.list(
      membership.householdId,
      membership.kind,
      user.id,
    );
  }

  @Post()
  @UseGuards(HouseholdAdminGuard)
  create(
    @CurrentMembership() membership: MembershipContext,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.create(membership.householdId, dto);
  }

  /** Personal-only: tree + flags for the My categories screen. */
  @Get('manage')
  @UseGuards(PersonalKindGuard)
  manageList(@CurrentMembership() membership: MembershipContext) {
    return this.categories.manageList(membership.householdId);
  }

  @Post('manage')
  @UseGuards(PersonalKindGuard)
  manageCreate(
    @CurrentMembership() membership: MembershipContext,
    @Body() dto: ManageCreateCategoryDto,
  ) {
    return this.categories.manageCreate(membership.householdId, dto);
  }

  @Patch('manage/:categoryId')
  @UseGuards(PersonalKindGuard)
  manageUpdate(
    @CurrentMembership() membership: MembershipContext,
    @Param('categoryId') categoryId: string,
    @Body() dto: ManageUpdateCategoryDto,
  ) {
    return this.categories.manageUpdate(
      membership.householdId,
      categoryId,
      dto,
    );
  }

  @Delete('manage/:categoryId')
  @UseGuards(PersonalKindGuard)
  manageDelete(
    @CurrentMembership() membership: MembershipContext,
    @Param('categoryId') categoryId: string,
  ) {
    return this.categories.manageDelete(membership.householdId, categoryId);
  }
}
