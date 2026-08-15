import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { MembershipContext } from './membership-context';

export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MembershipContext => {
    return ctx.switchToHttp().getRequest().membershipContext;
  },
);
