import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';

/**
 * Student self-service: everything scoped to the logged-in student's own
 * applicant record (req.user.applicantId). Staff accounts have no applicantId
 * and are rejected — this surface is for students only.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async overview(applicantId: string | null) {
    if (!applicantId) throw new ForbiddenException('This account has no student profile');
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        stage: true,
        programChoiceStatus: true,
        moodleUserId: true,
        chosenProgram: { select: { id: true, name: true, level: true } },
      },
    });
    if (!applicant) throw new ForbiddenException('Profile not found');

    const [terms, balance, documents, audit] = await Promise.all([
      this.finance.listApplicantTerms(applicantId),
      this.finance.applicantBalance(applicantId),
      this.prisma.document.findMany({
        where: { applicantId },
        select: { id: true, type: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.finance.degreeAudit(applicantId),
    ]);
    return { applicant, terms, balance, documents, audit };
  }
}
