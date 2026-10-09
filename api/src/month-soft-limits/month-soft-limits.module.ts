import { Module } from '@nestjs/common';
import { MonthSoftLimitsService } from './month-soft-limits.service';
import { MonthSoftLimitsController } from './month-soft-limits.controller';
import { HouseholdsModule } from '../households/households.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [HouseholdsModule, AccountsModule],
  providers: [MonthSoftLimitsService],
  controllers: [MonthSoftLimitsController],
  exports: [MonthSoftLimitsService],
})
export class MonthSoftLimitsModule {}
