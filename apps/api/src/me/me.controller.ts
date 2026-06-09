import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { MeService } from './me.service';

// Student portal API. JWT-protected; each route is scoped to the caller's own
// applicant record, so a student can only ever see their own data.
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('overview')
  overview(@Req() req: { user: { applicantId: string | null } }) {
    return this.me.overview(req.user.applicantId);
  }
}
