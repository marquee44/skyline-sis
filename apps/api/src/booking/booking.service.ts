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
import { ApplicantsService } from '../applicants/applicants.service';
import { isValidTimezone } from '../common/time';
import { generateSlots, Slot } from './slots';
import { CreateBookingDto, RescheduleDto } from './dto';

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
    private readonly applicants: ApplicantsService,
  ) {}

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
          zoomJoinUrl: process.env.ZOOM_FALLBACK_LINK || null,
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
      include: { advisor: true, applicant: true },
    });
    if (!c) throw new NotFoundException('Consultation not found');
    return c;
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
