import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ApplicantStage, EnrollmentStatus, TermEnrollmentStatus } from '@skyline/db';
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
    await this.jobs.work<{ applicantId: string; termId?: string }>(MOODLE_PROVISION_QUEUE, async (job) => {
      if (job.data.termId) await this.provisionTerm(job.data.applicantId, job.data.termId);
      else await this.provision(job.data.applicantId);
    });
    this.logger.log('Moodle provisioning worker ready');
  }

  async provision(
    applicantId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ moodleUserId: number | null; enrolled: number; pending: number }> {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('Applicant not found');

    // Gate: must have reached payment_received (or already enrolled, for retries).
    // `force` (admin test only) skips the finance gate so a student can be pushed
    // to Moodle without going through invoicing/payment.
    const eligible: ApplicantStage[] = [
      ApplicantStage.payment_received,
      ApplicantStage.enrolled,
      ApplicantStage.active_student,
    ];
    if (!opts.force && !eligible.includes(applicant.stage)) {
      throw new BadRequestException(`Applicant not eligible for provisioning (stage ${applicant.stage})`);
    }
    if (!applicant.chosenProgramId) throw new BadRequestException('Applicant has no chosen program');
    if (!this.moodle.configured) {
      this.logger.warn('Moodle not configured — provisioning deferred');
      throw new Error('Moodle not configured');
    }

    const moodleUserId = await this.ensureMoodleUser(applicant);

    // Enrol every mapped course across the whole chosen program (legacy/whole-program
    // path; the per-term path below enrols one semester at a time).
    const courses = await this.prisma.course.findMany({
      where: { programId: applicant.chosenProgramId, moodleCourseId: { not: null } },
    });
    const { enrolled, pending } = await this.enrolCourses(applicantId, moodleUserId, courses);

    if (courses.length > 0 && pending === 0 && applicant.stage === ApplicantStage.payment_received) {
      await this.applicants
        .transition(applicantId, ApplicantStage.enrolled, { note: 'provisioned in Moodle' })
        .catch((e) => this.logger.warn(`Advance to enrolled failed: ${(e as Error).message}`));
    }

    return { moodleUserId, enrolled, pending };
  }

  /**
   * Per-term (per-semester) provisioning: enrol the student in just THIS term's
   * Moodle courses. Gated on the TermEnrollment being paid (unless `force`, for the
   * admin test button). The multi-semester path — called by the payment hook and
   * the per-term provision button. Idempotent/resumable like the program path.
   */
  async provisionTerm(
    applicantId: string,
    termId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ moodleUserId: number | null; enrolled: number; pending: number }> {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('Applicant not found');
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new BadRequestException('Term not found');

    const te = await this.prisma.termEnrollment.findUnique({
      where: { applicantId_termId: { applicantId, termId } },
    });
    if (!opts.force && te?.status !== TermEnrollmentStatus.paid && te?.status !== TermEnrollmentStatus.enrolled) {
      throw new BadRequestException(`Term not paid (enrollment status: ${te?.status ?? 'none'})`);
    }
    if (!this.moodle.configured) {
      this.logger.warn('Moodle not configured — provisioning deferred');
      throw new Error('Moodle not configured');
    }

    const moodleUserId = await this.ensureMoodleUser(applicant);
    const courses = await this.prisma.course.findMany({
      where: { termId, moodleCourseId: { not: null } },
    });
    const { enrolled, pending } = await this.enrolCourses(applicantId, moodleUserId, courses);

    if (pending === 0) {
      await this.prisma.termEnrollment.upsert({
        where: { applicantId_termId: { applicantId, termId } },
        update: { status: TermEnrollmentStatus.enrolled, enrolledAt: new Date() },
        create: { applicantId, termId, status: TermEnrollmentStatus.enrolled, enrolledAt: new Date() },
      });
      // Once a semester is paid + enrolled the student is, by definition, active.
      await this.advanceToActiveStudent(applicantId, term.name);
      // Graduate once every semester of the program is enrolled.
      const totalTerms = await this.prisma.term.count({ where: { programId: term.programId } });
      const doneTerms = await this.prisma.termEnrollment.count({
        where: { applicantId, status: TermEnrollmentStatus.enrolled, term: { programId: term.programId } },
      });
      if (totalTerms > 0 && doneTerms >= totalTerms) {
        const a = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
        if (a?.stage === ApplicantStage.active_student) {
          await this.applicants
            .transition(applicantId, ApplicantStage.graduated, { note: 'all semesters completed' })
            .catch((e) => this.logger.warn(`graduate failed: ${(e as Error).message}`));
        }
      }
    }
    return { moodleUserId, enrolled, pending };
  }

  // The linear post-confirmation stages. In the per-term model the documents/
  // invoice stages are bypassed, so we fast-forward through them once a semester
  // is actually paid + enrolled.
  private static readonly POST_CONFIRM_CHAIN: ApplicantStage[] = [
    ApplicantStage.program_confirmed,
    ApplicantStage.documents_pending,
    ApplicantStage.documents_verified,
    ApplicantStage.invoice_issued,
    ApplicantStage.payment_received,
    ApplicantStage.enrolled,
    ApplicantStage.active_student,
  ];

  private async advanceToActiveStudent(applicantId: string, note: string) {
    // Step forward one legal transition at a time until active_student. Idempotent:
    // a student already active (or off the linear chain) is left untouched.
    for (let guard = 0; guard < ProvisioningService.POST_CONFIRM_CHAIN.length; guard++) {
      const a = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
      if (!a) return;
      const idx = ProvisioningService.POST_CONFIRM_CHAIN.indexOf(a.stage);
      if (idx === -1 || a.stage === ApplicantStage.active_student) return;
      const next = ProvisioningService.POST_CONFIRM_CHAIN[idx + 1];
      try {
        await this.applicants.transition(applicantId, next, { note: `enrolled in ${note}` });
      } catch (e) {
        this.logger.warn(`fast-forward ${a.stage}→${next} failed: ${(e as Error).message}`);
        return;
      }
    }
  }

  // ── shared helpers ──────────────────────────────────────────────────────────
  private async ensureMoodleUser(applicant: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    moodleUserId: number | null;
  }): Promise<number> {
    if (applicant.moodleUserId) return applicant.moodleUserId;
    const existing = await this.moodle.findUserByEmail(applicant.email);
    const moodleUserId =
      existing?.id ??
      (await this.moodle.createUser({
        email: applicant.email,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
      }));
    await this.prisma.applicant.update({ where: { id: applicant.id }, data: { moodleUserId } });
    return moodleUserId;
  }

  private async enrolCourses(
    applicantId: string,
    moodleUserId: number,
    courses: { id: string; moodleCourseId: number | null }[],
  ): Promise<{ enrolled: number; pending: number }> {
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
    return { enrolled, pending };
  }
}
