import { Module } from '@nestjs/common';
import { HouseholdAccessService } from './household-access.service';
import { HouseholdGuard } from './household.guard';
import { HouseholdAdminGuard } from './household-admin.guard';
import { HouseKindGuard } from './house-kind.guard';
import { HouseholdsService } from './households.service';
import { HouseholdsController } from './households.controller';

@Module({
  providers: [
    HouseholdAccessService,
    HouseholdGuard,
    HouseholdAdminGuard,
    HouseKindGuard,
    HouseholdsService,
  ],
  controllers: [HouseholdsController],
  exports: [
    HouseholdAccessService,
    HouseholdGuard,
    HouseholdAdminGuard,
    HouseKindGuard,
    HouseholdsService,
  ],
})
export class HouseholdsModule {}
