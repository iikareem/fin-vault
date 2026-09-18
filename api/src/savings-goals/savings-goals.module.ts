import { Module } from '@nestjs/common';
import { SavingsGoalsService } from './savings-goals.service';
import { SavingsGoalsController } from './savings-goals.controller';
import { HouseholdsModule } from '../households/households.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [HouseholdsModule, AccountsModule],
  providers: [SavingsGoalsService],
  controllers: [SavingsGoalsController],
})
export class SavingsGoalsModule {}
