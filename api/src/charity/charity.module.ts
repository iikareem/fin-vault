import { Module } from '@nestjs/common';
import { CharityService } from './charity.service';
import { CharityController } from './charity.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [HouseholdsModule],
  providers: [CharityService],
  controllers: [CharityController],
})
export class CharityModule {}
