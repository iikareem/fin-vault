import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdGuard } from '../households/household.guard';
import { HouseholdAdminGuard } from '../households/household-admin.guard';
import { CurrentMembership } from '../households/current-membership.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MembershipContext } from '../households/membership-context';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Controller('households/:householdId/transactions')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class TransactionsController {
  constructor(private txs: TransactionsService) {}

  @Get()
  list(
    @CurrentMembership() membership: MembershipContext,
    @Query('day') day?: string,
  ) {
    return this.txs.list(membership.householdId, membership.kind, day);
  }

  @Post()
  @UseGuards(HouseholdAdminGuard)
  create(
    @CurrentMembership() membership: MembershipContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.txs.create(membership.householdId, membership.kind, user.id, dto);
  }

  @Patch(':id')
  @UseGuards(HouseholdAdminGuard)
  update(
    @CurrentMembership() membership: MembershipContext,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.txs.update(membership.householdId, membership.kind, id, dto);
  }

  @Delete(':id')
  @UseGuards(HouseholdAdminGuard)
  remove(
    @CurrentMembership() membership: MembershipContext,
    @Param('id') id: string,
  ) {
    return this.txs.remove(membership.householdId, id);
  }
}
