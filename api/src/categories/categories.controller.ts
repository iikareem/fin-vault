import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { MembershipContext } from '../households/membership-context';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('households/:householdId/categories')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(@CurrentMembership() membership: MembershipContext) {
    return this.categories.list(membership.householdId, membership.kind);
  }

  @Post()
  @UseGuards(HouseholdAdminGuard)
  create(
    @CurrentMembership() membership: MembershipContext,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.create(membership.householdId, dto);
  }
}
