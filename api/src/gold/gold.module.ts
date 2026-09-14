import { Module } from '@nestjs/common';
import { GoldService } from './gold.service';
import { GoldPriceService } from './gold-price.service';
import { GoldController } from './gold.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [HouseholdsModule],
  providers: [GoldService, GoldPriceService],
  controllers: [GoldController],
})
export class GoldModule {}
