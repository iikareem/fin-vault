import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { HouseholdsModule } from '../households/households.module';
import { MonthSoftLimitsModule } from '../month-soft-limits/month-soft-limits.module';

@Module({
  imports: [HouseholdsModule, MonthSoftLimitsModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
