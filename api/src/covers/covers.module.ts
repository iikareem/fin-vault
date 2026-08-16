import { Module } from '@nestjs/common';
import { CoversService } from './covers.service';
import { CoversController } from './covers.controller';
import { HouseholdsModule } from '../households/households.module';

@Module({
  imports: [HouseholdsModule],
  providers: [CoversService],
  controllers: [CoversController],
})
export class CoversModule {}
