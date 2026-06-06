import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@skyline/db';

export const ROLES_KEY = 'roles';

/** Restrict a route to one or more roles, e.g. @Roles('staff', 'admin'). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
}
