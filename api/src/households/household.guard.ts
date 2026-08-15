import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { HouseholdAccessService } from './household-access.service';
import { AuthUser } from '../auth/auth-user';

@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(private access: HouseholdAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser;
    const householdId = req.params.householdId as string;
    req.membershipContext = await this.access.requireMember(user.id, householdId);
    return true;
  }
}
