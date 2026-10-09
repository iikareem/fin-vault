import { Module } from '@nestjs/common';
import { MonthSoftLimitsService } from './month-soft-limits.service';
import { MonthSoftLimitsController } from './month-soft-limits.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [HouseholdsModule],
  providers: [MonthSoftLimitsService],
  controllers: [MonthSoftLimitsController],
  exports: [MonthSoftLimitsService],
})
export class MonthSoftLimitsModule {}
