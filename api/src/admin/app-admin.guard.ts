import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isAppAdminEmail } from './app-admin';

@Injectable()
export class AppAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      user?: { email?: string };
    }>();
    if (!isAppAdminEmail(req.user?.email)) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
