import { HouseholdKind, Role } from '@prisma/client';

export class MembershipContext {
  householdId: string;
  role: Role;
  kind: HouseholdKind;
  currency: string;
  name: string;
}
