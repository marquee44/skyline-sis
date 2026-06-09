import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from './guards';
import { Roles } from './roles';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto';

/**
 * Auth surface: password login → JWT, plus the guard/roles plumbing every
 * feature module uses to protect routes.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Exchange email + password for a JWT.
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // Returns the current user decoded from the JWT. 401 without a valid token.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: unknown }) {
    return req.user;
  }

  // Self-service password change (any authenticated user).
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: { user: { id: string } }) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }

  // Admin/staff: create (or reset) a student login for an applicant. Returns a
  // one-time temp password to hand over (or email, once mail is live).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('staff', 'admin')
  @Post('students/:applicantId/login')
  createStudentLogin(@Param('applicantId') applicantId: string) {
    return this.auth.createStudentLogin(applicantId);
  }
}
