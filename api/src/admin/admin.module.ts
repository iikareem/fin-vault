import { Module } from '@nestjs/common';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';
import { AppAdminGuard } from './app-admin.guard';

@Module({
  controllers: [AdminActivityController],
  providers: [AdminActivityService, AppAdminGuard],
})
export class AdminModule {}
