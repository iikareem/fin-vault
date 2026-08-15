import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MembershipContext } from './membership-context';

@Injectable()
export class HouseholdAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = context.switchToHttp().getRequest()
      .membershipContext as MembershipContext;
    if (ctx?.role !== 'ADMIN') {
      throw new ForbiddenException('Only an admin can do this');
    }
    return true;
  }
}
