import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [HouseholdsModule],
  providers: [AccountsService],
  controllers: [AccountsController],
})
export class AccountsModule {}
