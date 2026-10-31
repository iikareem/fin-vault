import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { HouseholdsModule } from '../households/households.module';
import { MonthSoftLimitsModule } from '../month-soft-limits/month-soft-limits.module';

@Module({
  imports: [HouseholdsModule, MonthSoftLimitsModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
