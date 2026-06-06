import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from './guards';
import { Roles } from './roles';

/**
 * Auth surface. The full login/registration flow (password verify → issue JWT)
 * lands in a later increment; this establishes the guard + roles plumbing so
 * every feature module can protect routes from day one.
 */
@Controller('auth')
export class AuthController {
  // Returns the current user decoded from the JWT. 401 without a valid token.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: unknown }) {
    return req.user;
  }

  // Example of a staff-only route, proving the roles guard is wired.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  @Get('staff-check')
  staffCheck() {
    return { ok: true, scope: 'staff' };
  }
}
