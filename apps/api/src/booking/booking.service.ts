import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { ApplicantStage, ConsultationStatus, Prisma } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ZoomService } from '../zoom/zoom.service';
import { ApplicantsService } from '../applicants/applicants.service';
import { isValidTimezone } from '../common/time';
import { generateSlots, Slot } from './slots';
import { CreateBookingDto, RescheduleDto } from './dto';

// Hidden advisor used only by the admin test-consultation shortcut.
const TESTING_ADVISOR_EMAIL = 'testing-advisor@skyline-as.ae';

// A slot counts as "taken" only while it's a live booking; cancelled/no-show free it.
const ACTIVE_STATUSES: ConsultationStatus[] = [
  ConsultationStatus.booked,
  ConsultationStatus.completed,
];

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly zoom: ZoomService,
    private readonly applicants: ApplicantsService,
  ) {}

  private minutesBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 60000);
  }

  // Reserved slot-starts (epoch ms) for an advisor over a UTC window.
  private async takenSet(advisorId: string, fromUtc: Date, toUtc: Date): Promise<Set<number>> {
    const rows = await this.prisma.consultation.findMany({
      where: {
        advisorId,
        status: { in: ACTIVE_STATUSES },
        scheduledStartUtc: { gte: fromUtc, lte: toUtc },
      },
      select: { scheduledStartUtc: true },
    });
    return new Set(rows.map((r) => r.scheduledStartUtc.getTime()));
  }

  async availableSlots(advisorId: string, from: string, to: string): Promise<Slot[]> {
    const advisor = await this.prisma.advisor.findUnique({
      where: { id: advisorId },
      include: { availabilityRules: true },
    });
    if (!advisor) throw new NotFoundException('Advisor not found');
    if (!advisor.active) return [];

    // Widen the taken-query window by a day each side to cover timezone offsets.
    const fromUtc = DateTime.fromISO(from).minus({ days: 1 }).toJSDate();
    const toUtc = DateTime.fromISO(to).plus({ days: 2 }).toJSDate();
    const taken = await this.takenSet(advisorId, fromUtc, toUtc);

    return generateSlots(advisor.availabilityRules, from, to, new Date(), taken);
  }

  /** Find the advisor's slot that starts exactly at `startUtc`, or null. */
  private async matchSlot(advisorId: string, startUtc: Date): Promise<Slot | null> {
    const advisor = await this.prisma.advisor.findUnique({
      where: { id: advisorId },
      include: { availabilityRules: true },
    });
    if (!advisor || !advisor.active) return null;

    // Generate across the UTC date ±1 day so any rule timezone is covered.
    const center = DateTime.fromJSDate(startUtc).toUTC();
    const from = center.minus({ days: 1 }).toISODate()!;
    const to = center.plus({ days: 1 }).toISODate()!;
    const slots = generateSlots(advisor.availabilityRules, from, to, new Date());
    return slots.find((s) => s.startUtc.getTime() === startUtc.getTime()) ?? null;
  }

  async book(dto: CreateBookingDto, byUserId?: string) {
    if (!isValidTimezone(dto.studentTimezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${dto.studentTimezone}`);
    }
    const applicant = await this.prisma.applicant.findUnique({ where: { id: dto.applicantId } });
    if (!applicant) throw new BadRequestException('applicantId does not exist');

    const startUtc = new Date(dto.scheduledStartUtc);
    const slot = await this.matchSlot(dto.advisorId, startUtc);
    if (!slot) {
      throw new BadRequestException('Requested time is not an available slot for this advisor');
    }

    // Auto-create a Zoom meeting (falls back to the standing link if Zoom isn't
    // configured yet). Done before insert so the link is stored atomically.
    const zoomJoinUrl = await this.zoom.createMeeting({
      topic: 'Skyline admissions consultation',
      startUtc: slot.startUtc,
      durationMinutes: this.minutesBetween(slot.startUtc, slot.endUtc),
      timezone: dto.studentTimezone,
    });

    let consultation;
    try {
      consultation = await this.prisma.consultation.create({
        data: {
          applicantId: dto.applicantId,
          advisorId: dto.advisorId,
          scheduledStartUtc: slot.startUtc,
          scheduledEndUtc: slot.endUtc,
          studentTimezone: dto.studentTimezone,
          status: ConsultationStatus.booked,
          zoomJoinUrl,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('That slot was just taken — pick another');
      }
      throw e;
    }

    // Advance the pipeline if the applicant is still at intake.
    if (applicant.stage === ApplicantStage.intake_started) {
      try {
        await this.applicants.transition(applicant.id, ApplicantStage.consultation_booked, {
          note: 'consultation booked',
          byUserId,
        });
      } catch (e) {
        this.logger.warn(`Stage transition after booking failed: ${(e as Error).message}`);
      }
    }

    await this.sendConfirmation(consultation.id);
    return consultation;
  }

  async reschedule(id: string, dto: RescheduleDto) {
    const existing = await this.prisma.consultation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Consultation not found');
    if (existing.status !== ConsultationStatus.booked) {
      throw new BadRequestException('Only booked consultations can be rescheduled');
    }
    const startUtc = new Date(dto.scheduledStartUtc);
    const slot = await this.matchSlot(existing.advisorId, startUtc);
    if (!slot) throw new BadRequestException('Requested time is not an available slot');

    try {
      const updated = await this.prisma.consultation.update({
        where: { id },
        data: {
          scheduledStartUtc: slot.startUtc,
          scheduledEndUtc: slot.endUtc,
          studentTimezone: dto.studentTimezone ?? existing.studentTimezone,
          reminderSentAt: null, // re-arm the (future) reminder for the new time
        },
      });
      await this.sendConfirmation(id, 'rescheduled');
      return updated;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('That slot was just taken — pick another');
      }
      throw e;
    }
  }

  /** Move a consultation to a specific advisor (staff override — no slot re-check). */
  async reassign(id: string, advisorId: string) {
    if (!advisorId) throw new BadRequestException('advisorId is required');
    const existing = await this.prisma.consultation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Consultation not found');
    const advisor = await this.prisma.advisor.findUnique({ where: { id: advisorId } });
    if (!advisor) throw new BadRequestException('advisorId does not exist');
    return this.prisma.consultation.update({ where: { id }, data: { advisorId } });
  }

  async cancel(id: string) {
    const existing = await this.prisma.consultation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Consultation not found');
    // Setting status to cancelled frees the slot (partial unique index ignores it).
    return this.prisma.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.cancelled },
    });
  }

  list(filter: { advisorId?: string; applicantId?: string; status?: ConsultationStatus }) {
    return this.prisma.consultation.findMany({
      where: filter,
      orderBy: { scheduledStartUtc: 'asc' },
      include: {
        advisor: { select: { id: true, name: true } },
        applicant: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async get(id: string) {
    const c = await this.prisma.consultation.findUnique({
      where: { id },
      include: { advisor: true, applicant: true, record: true },
    });
    if (!c) throw new NotFoundException('Consultation not found');
    return c;
  }

  // Advisor prep view (spec section 6 "Before"): the intake answers to read
  // before the call, plus any record already started.
  async prep(id: string) {
    const c = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        advisor: { select: { id: true, name: true } },
        applicant: true,
        record: true,
      },
    });
    if (!c) throw new NotFoundException('Consultation not found');
    return {
      consultation: { id: c.id, scheduledStartUtc: c.scheduledStartUtc, status: c.status },
      advisor: c.advisor,
      intake: {
        name: `${c.applicant.firstName} ${c.applicant.lastName}`,
        email: c.applicant.email,
        countryOfOrigin: c.applicant.countryOfOrigin,
        residenceCity: c.applicant.residenceCity,
        priorEducation: c.applicant.priorEducation,
        interests: c.applicant.interests,
      },
      record: c.record,
    };
  }

  /**
   * Save the structured consultation outcome (spec section 6 "After"). Upserts
   * the record, marks the consultation completed, and advances the applicant to
   * consultation_completed.
   */
  async saveRecord(
    id: string,
    dto: import('./record.dto').ConsultationRecordDto,
    byUserId?: string,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: { applicant: true },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');

    if (dto.recommendedProgramId) {
      const prog = await this.prisma.program.findUnique({ where: { id: dto.recommendedProgramId } });
      if (!prog) throw new BadRequestException('recommendedProgramId does not exist');
    }

    const record = await this.prisma.consultationRecord.upsert({
      where: { consultationId: id },
      update: { ...dto },
      create: { consultationId: id, ...dto },
    });

    if (consultation.status !== ConsultationStatus.completed) {
      await this.prisma.consultation.update({
        where: { id },
        data: { status: ConsultationStatus.completed },
      });
    }
    if (consultation.applicant.stage === ApplicantStage.consultation_booked) {
      try {
        await this.applicants.transition(
          consultation.applicantId,
          ApplicantStage.consultation_completed,
          { note: 'consultation record saved', byUserId },
        );
      } catch (e) {
        this.logger.warn(`Stage transition after record failed: ${(e as Error).message}`);
      }
    }
    return record;
  }

  /**
   * TEST-ONLY (admin) shortcut: fabricate a completed consultation so a single
   * admin can drive an applicant through the pipeline without setting up an
   * advisor, availability and a real booking. A consultation requires an advisor
   * FK, so we attach a hidden, inactive "Testing (admin)" advisor (created once
   * and reused) — the operator never has to manage advisors. Skips slot /
   * availability checks entirely; advances the applicant to consultation_completed.
   */
  async testCompleteConsultation(applicantId: string, byUserId?: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundException('Applicant not found');
    if (
      applicant.stage !== ApplicantStage.intake_started &&
      applicant.stage !== ApplicantStage.consultation_booked
    ) {
      throw new BadRequestException(
        `Applicant is at stage "${applicant.stage}" — the test consultation only applies before consultation_completed`,
      );
    }

    // Find-or-create the singleton hidden testing advisor.
    const advisor = await this.prisma.advisor.upsert({
      where: { email: TESTING_ADVISOR_EMAIL },
      update: {},
      create: { name: 'Testing (admin)', email: TESTING_ADVISOR_EMAIL, active: false },
    });

    const start = new Date();
    const end = new Date(start.getTime() + 30 * 60000);
    const consultation = await this.prisma.consultation.create({
      data: {
        applicantId,
        advisorId: advisor.id,
        scheduledStartUtc: start,
        scheduledEndUtc: end,
        studentTimezone: 'Asia/Dubai',
        status: ConsultationStatus.completed,
      },
    });

    // Walk the state machine forward to consultation_completed.
    if (applicant.stage === ApplicantStage.intake_started) {
      await this.applicants.transition(applicantId, ApplicantStage.consultation_booked, {
        note: 'test consultation (admin shortcut)',
        byUserId,
      });
    }
    await this.applicants.transition(applicantId, ApplicantStage.consultation_completed, {
      note: 'test consultation completed (admin shortcut)',
      byUserId,
    });

    return { consultationId: consultation.id, stage: ApplicantStage.consultation_completed };
  }

  private async sendConfirmation(consultationId: string, verb = 'confirmed') {
    const c = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { applicant: true, advisor: true },
    });
    if (!c) return;
    const local = DateTime.fromJSDate(c.scheduledStartUtc).setZone(c.studentTimezone);
    const when = local.toFormat("cccc d LLLL yyyy 'at' HH:mm '('ZZZZ')'");
    const link = c.zoomJoinUrl ? `\nJoin: ${c.zoomJoinUrl}` : '';
    await this.email.send({
      to: c.applicant.email,
      subject: `Your Skyline consultation is ${verb}`,
      text:
        `Hi ${c.applicant.firstName},\n\n` +
        `Your consultation with ${c.advisor.name} is ${verb} for:\n${when}${link}\n\n` +
        `— Skyline University Admission Services`,
    });
  }
}
