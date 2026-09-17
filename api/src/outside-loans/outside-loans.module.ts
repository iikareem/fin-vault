import { Module } from '@nestjs/common';
import { OutsideLoansService } from './outside-loans.service';
import { OutsideLoansController } from './outside-loans.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [HouseholdsModule],
  providers: [OutsideLoansService],
  controllers: [OutsideLoansController],
})
export class OutsideLoansModule {}
