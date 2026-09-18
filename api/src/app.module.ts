import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HouseholdsModule } from './households/households.module';
import { LoansModule } from './loans/loans.module';
import { ClaimsModule } from './claims/claims.module';
import { CharityModule } from './charity/charity.module';
import { PayoutsModule } from './payouts/payouts.module';
import { CoversModule } from './covers/covers.module';
import { HistoryModule } from './history/history.module';
import { GoldModule } from './gold/gold.module';
import { OutsideLoansModule } from './outside-loans/outside-loans.module';
import { SavingsGoalsModule } from './savings-goals/savings-goals.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HouseholdsModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    AnalyticsModule,
    LoansModule,
    ClaimsModule,
    CharityModule,
    PayoutsModule,
    CoversModule,
    HistoryModule,
    GoldModule,
    OutsideLoansModule,
    SavingsGoalsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
