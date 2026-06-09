import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { MoodleReadbackService } from './readback.service';

/**
 * Student-facing transcript. Lives in MoodleModule (alongside the read-back
 * service) on purpose — wiring it through a separate module that imports
 * MoodleModule deadlocked app boot, so we keep it here. Scoped to the caller's
 * own applicantId from the JWT, so a student only ever sees their own grades.
 */
@UseGuards(JwtAuthGuard)
@Controller('me')
export class StudentTranscriptController {
  constructor(private readonly readback: MoodleReadbackService) {}

  @Get('transcript')
  transcript(@Req() req: { user: { applicantId: string | null } }) {
    if (!req.user.applicantId) throw new ForbiddenException('This account has no student profile');
    return this.readback.transcript(req.user.applicantId);
  }
}
