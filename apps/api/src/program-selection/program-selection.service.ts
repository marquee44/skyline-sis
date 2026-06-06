import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApplicantStage, ProgramChoiceStatus, Prisma } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Program selection (spec section 7): student proposes → advisor approves or
 * rejects → student confirms. This service is the AUTHORITATIVE driver of both
 * `program_choice_status` (source of truth) and the mirrored applicant stage —
 * it moves them together, in a transaction, with an audit entry. The stage
 * machine's guard then guarantees nothing else can set these stages out of band.
 */
@Injectable()
export class ProgramSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  private async apply(
    applicantId: string,
    data: Prisma.ApplicantUpdateInput,
    toStage: ApplicantStage,
    note: string,
    byUserId?: string,
  ) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundException('Applicant not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.applicant.update({ where: { id: applicantId }, data: { ...data, stage: toStage } }),
      this.prisma.stageTransition.create({
        data: { applicantId, fromStage: applicant.stage, toStage, note, byUserId },
      }),
    ]);
    return updated;
  }

  // Student proposes a program (from the active catalog) after the consultation.
  async propose(applicantId: string, programId: string, byUserId?: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundException('Applicant not found');
    const allowed: ApplicantStage[] = [
      ApplicantStage.consultation_completed,
      ApplicantStage.program_proposed,
    ];
    if (!allowed.includes(applicant.stage)) {
      throw new BadRequestException('Applicant must have completed a consultation first');
    }
    const program = await this.prisma.program.findFirst({ where: { id: programId, active: true } });
    if (!program) throw new BadRequestException('programId is not an active program');

    return this.apply(
      applicantId,
      {
        proposedProgram: { connect: { id: programId } },
        programChoiceStatus: ProgramChoiceStatus.proposed,
        proposedAt: new Date(),
        choiceAdvisorNote: null,
      },
      ApplicantStage.program_proposed,
      `proposed program ${program.name}`,
      byUserId,
    );
  }

  // Advisor approves the proposed program.
  async approve(applicantId: string, note: string | undefined, byUserId?: string) {
    const applicant = await this.requireStatus(applicantId, ProgramChoiceStatus.proposed);
    return this.apply(
      applicantId,
      {
        programChoiceStatus: ProgramChoiceStatus.approved,
        approvedAt: new Date(),
        choiceAdvisorNote: note ?? applicant.choiceAdvisorNote,
      },
      ApplicantStage.program_approved,
      note ? `approved: ${note}` : 'approved',
      byUserId,
    );
  }

  // Advisor rejects — applicant returns to consultation_completed to re-propose.
  async reject(applicantId: string, note: string | undefined, byUserId?: string) {
    await this.requireStatus(applicantId, ProgramChoiceStatus.proposed);
    return this.apply(
      applicantId,
      {
        programChoiceStatus: ProgramChoiceStatus.rejected,
        choiceAdvisorNote: note,
      },
      ApplicantStage.consultation_completed,
      note ? `rejected: ${note}` : 'rejected',
      byUserId,
    );
  }

  // Student gives final confirmation → locks in the chosen program.
  async confirm(applicantId: string, byUserId?: string) {
    const applicant = await this.requireStatus(applicantId, ProgramChoiceStatus.approved);
    if (!applicant.proposedProgramId) throw new BadRequestException('No proposed program to confirm');
    return this.apply(
      applicantId,
      {
        chosenProgram: { connect: { id: applicant.proposedProgramId } },
        programChoiceStatus: ProgramChoiceStatus.confirmed,
        confirmedAt: new Date(),
      },
      ApplicantStage.program_confirmed,
      'confirmed enrollment',
      byUserId,
    );
  }

  private async requireStatus(applicantId: string, status: ProgramChoiceStatus) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundException('Applicant not found');
    if (applicant.programChoiceStatus !== status) {
      throw new BadRequestException(
        `Expected program_choice_status = ${status}, but it is ${applicant.programChoiceStatus}`,
      );
    }
    return applicant;
  }
}
