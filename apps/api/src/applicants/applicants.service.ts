import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApplicantStage, Prisma } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicantDto, UpdateApplicantDto } from './dto';
import { allowedNextStages, canTransition } from './stage-machine';

@Injectable()
export class ApplicantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { stage?: ApplicantStage; advisorId?: string }) {
    const applicants = await this.prisma.applicant.findMany({
      where: {
        stage: filter.stage,
        assignedAdvisorId: filter.advisorId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedAdvisor: { select: { id: true, name: true } },
      },
    });
    // Attach the legal next stages so the UI never has to mirror the graph.
    return applicants.map((a) => ({ ...a, allowedNextStages: allowedNextStages(a.stage) }));
  }

  async get(id: string) {
    const a = await this.prisma.applicant.findUnique({
      where: { id },
      include: {
        assignedAdvisor: { select: { id: true, name: true } },
        proposedProgram: { select: { id: true, name: true } },
        chosenProgram: { select: { id: true, name: true } },
        stageTransitions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!a) throw new NotFoundException('Applicant not found');
    return { ...a, allowedNextStages: allowedNextStages(a.stage) };
  }

  async create(dto: CreateApplicantDto) {
    try {
      const applicant = await this.prisma.applicant.create({
        data: { ...dto, stage: ApplicantStage.intake_started },
      });
      // Record the initial stage so the history starts at the beginning.
      await this.prisma.stageTransition.create({
        data: {
          applicantId: applicant.id,
          fromStage: null,
          toStage: ApplicantStage.intake_started,
          note: 'created',
        },
      });
      return applicant;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('An applicant with that email already exists');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateApplicantDto) {
    await this.get(id);
    if (dto.assignedAdvisorId) {
      const adv = await this.prisma.advisor.findUnique({ where: { id: dto.assignedAdvisorId } });
      if (!adv) throw new BadRequestException('assignedAdvisorId does not exist');
    }
    return this.prisma.applicant.update({ where: { id }, data: dto });
  }

  /**
   * Move an applicant to a new stage through the state machine. Validates the
   * transition, applies it, and appends to the audit log — all in one
   * transaction so the stage and its history can never disagree.
   */
  async transition(
    id: string,
    toStage: ApplicantStage,
    opts: { note?: string; byUserId?: string },
  ) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException('Applicant not found');

    const check = canTransition(applicant.stage, toStage, {
      programChoiceStatus: applicant.programChoiceStatus,
    });
    if (!check.ok) throw new BadRequestException(check.reason);

    const [updated] = await this.prisma.$transaction([
      this.prisma.applicant.update({ where: { id }, data: { stage: toStage } }),
      this.prisma.stageTransition.create({
        data: {
          applicantId: id,
          fromStage: applicant.stage,
          toStage,
          note: opts.note,
          byUserId: opts.byUserId,
        },
      }),
    ]);
    return { ...updated, allowedNextStages: allowedNextStages(updated.stage) };
  }

  async history(id: string) {
    await this.get(id);
    return this.prisma.stageTransition.findMany({
      where: { applicantId: id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
