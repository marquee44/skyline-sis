import { BadRequestException, Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { PrismaService } from '../prisma/prisma.service';
import { MoodleReadbackService } from './readback.service';
import { MoodleService } from './moodle.service';

/**
 * Student-facing Moodle endpoints. Live in MoodleModule (alongside the Moodle
 * services) on purpose — wiring them through a separate module that imports
 * MoodleModule deadlocked app boot. Scoped to the caller's own applicantId.
 */
@UseGuards(JwtAuthGuard)
@Controller('me')
export class StudentTranscriptController {
  constructor(
    private readonly readback: MoodleReadbackService,
    private readonly prisma: PrismaService,
    private readonly moodle: MoodleService,
  ) {}

  @Get('transcript')
  transcript(@Req() req: { user: { applicantId: string | null } }) {
    if (!req.user.applicantId) throw new ForbiddenException('This account has no student profile');
    return this.readback.transcript(req.user.applicantId);
  }

  // A one-time Moodle login URL for this student, so the portal can drop them
  // straight into Moodle as themselves (no second login).
  @Get('moodle-login')
  async moodleLogin(@Req() req: { user: { applicantId: string | null } }) {
    if (!req.user.applicantId) throw new ForbiddenException('This account has no student profile');
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: req.user.applicantId },
      select: { email: true, moodleUserId: true },
    });
    if (!applicant) throw new ForbiddenException('Profile not found');
    if (!applicant.moodleUserId) throw new BadRequestException('You are not enrolled in Moodle yet');
    const loginUrl = await this.moodle.requestLoginUrl(applicant.email);
    return { loginUrl };
  }
}
