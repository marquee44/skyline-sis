import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ApplicantStage, EnrollmentStatus } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { ApplicantsService } from '../applicants/applicants.service';
import { MoodleService } from './moodle.service';
import { MOODLE_PROVISION_QUEUE } from './queue';

/**
 * Moodle provisioning (spec section 12) — finance-gated, idempotent, resumable.
 * Runs as a pg-boss job (enqueued by finance on unlock, or manually).
 *
 * Flow:
 *  1. Ensure a Moodle user exists (look up by email first → store moodle_user_id).
 *  2. For each course in the chosen program that has a moodle_course_id, enrol —
 *     tracked per course in CourseEnrollment so re-running only does what's left.
 *  3. When all required courses are enrolled, advance the applicant to `enrolled`.
 */
@Injectable()
export class ProvisioningService implements OnModuleInit {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly moodle: MoodleService,
    private readonly applicants: ApplicantsService,
  ) {}

  async onModuleInit() {
    await this.jobs.createQueue(MOODLE_PROVISION_QUEUE);
    await this.jobs.work<{ applicantId: string }>(MOODLE_PROVISION_QUEUE, async (job) => {
      await this.provision(job.data.applicantId);
    });
    this.logger.log('Moodle provisioning worker ready');
  }

  async provision(applicantId: string): Promise<{ moodleUserId: number | null; enrolled: number; pending: number }> {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('Applicant not found');

    // Gate: must have reached payment_received (or already enrolled, for retries).
    const eligible: ApplicantStage[] = [
      ApplicantStage.payment_received,
      ApplicantStage.enrolled,
      ApplicantStage.active_student,
    ];
    if (!eligible.includes(applicant.stage)) {
      throw new BadRequestException(`Applicant not eligible for provisioning (stage ${applicant.stage})`);
    }
    if (!applicant.chosenProgramId) throw new BadRequestException('Applicant has no chosen program');
    if (!this.moodle.configured) {
      this.logger.warn('Moodle not configured — provisioning deferred');
      throw new Error('Moodle not configured');
    }

    // 1) Idempotent user creation.
    let moodleUserId = applicant.moodleUserId;
    if (!moodleUserId) {
      const existing = await this.moodle.findUserByEmail(applicant.email);
      moodleUserId = existing?.id ?? (await this.moodle.createUser({
        email: applicant.email,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
      }));
      await this.prisma.applicant.update({ where: { id: applicantId }, data: { moodleUserId } });
    }

    // 2) Enrol each mapped course, tracked per course.
    const courses = await this.prisma.course.findMany({
      where: { programId: applicant.chosenProgramId, moodleCourseId: { not: null } },
    });
    let enrolled = 0;
    let pending = 0;
    for (const course of courses) {
      const existing = await this.prisma.courseEnrollment.findUnique({
        where: { applicantId_courseId: { applicantId, courseId: course.id } },
      });
      if (existing?.status === EnrollmentStatus.enrolled) {
        enrolled++;
        continue;
      }
      try {
        await this.moodle.enrolInCourse(moodleUserId, course.moodleCourseId!);
        await this.prisma.courseEnrollment.upsert({
          where: { applicantId_courseId: { applicantId, courseId: course.id } },
          update: { status: EnrollmentStatus.enrolled, error: null, enrolledAt: new Date() },
          create: { applicantId, courseId: course.id, status: EnrollmentStatus.enrolled, enrolledAt: new Date() },
        });
        enrolled++;
      } catch (e) {
        pending++;
        await this.prisma.courseEnrollment.upsert({
          where: { applicantId_courseId: { applicantId, courseId: course.id } },
          update: { status: EnrollmentStatus.failed, error: (e as Error).message },
          create: { applicantId, courseId: course.id, status: EnrollmentStatus.failed, error: (e as Error).message },
        });
        this.logger.warn(`Enrol failed (course ${course.id}): ${(e as Error).message}`);
      }
    }

    // 3) Advance only when everything mapped is enrolled.
    if (courses.length > 0 && pending === 0 && applicant.stage === ApplicantStage.payment_received) {
      await this.applicants
        .transition(applicantId, ApplicantStage.enrolled, { note: 'provisioned in Moodle' })
        .catch((e) => this.logger.warn(`Advance to enrolled failed: ${(e as Error).message}`));
    }

    return { moodleUserId, enrolled, pending };
  }
}
