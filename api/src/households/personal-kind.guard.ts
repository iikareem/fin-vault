import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MembershipContext } from './membership-context';

@Injectable()
export class PersonalKindGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = context.switchToHttp().getRequest()
      .membershipContext as MembershipContext;
    if (ctx?.kind !== 'PERSONAL') {
      throw new ForbiddenException('This only applies to your personal money');
    }
    return true;
  }
}
