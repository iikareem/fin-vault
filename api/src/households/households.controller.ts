import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { HouseholdsService } from './households.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class HouseholdsController {
  constructor(private households: HouseholdsService) {}

  @Get('spaces')
  list(@CurrentUser() user: AuthUser) {
    return this.households.listSpaces(user.id);
  }

  @Post('houses')
  create() {
    return this.households.createHouse();
  }
}
