import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MembershipContext } from './membership-context';

@Injectable()
export class HouseKindGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = context.switchToHttp().getRequest()
      .membershipContext as MembershipContext;
    if (ctx?.kind !== 'HOUSE') {
      throw new ForbiddenException('This only applies to a shared house');
    }
    return true;
  }
}
