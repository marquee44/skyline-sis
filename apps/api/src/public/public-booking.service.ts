import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { BookingService } from '../booking/booking.service';
import { ApplicantsService } from '../applicants/applicants.service';
import { PublicBookDto } from './dto';

/**
 * Powers the public self-service consultation page. Bookings land on the single
 * advisor flagged `publicBooking` (the shared "Consultations" calendar); staff
 * reassign to a specific advisor afterwards. Reuses the staff BookingService so
 * Zoom links, confirmation emails and pipeline transitions all happen the same way.
 */
@Injectable()
export class PublicBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
    private readonly applicants: ApplicantsService,
  ) {}

  private async publicAdvisor() {
    const a = await this.prisma.advisor.findFirst({ where: { publicBooking: true, active: true } });
    if (!a) throw new ServiceUnavailableException('Online booking is not available right now');
    return a;
  }

  async config() {
    const advisor = await this.prisma.advisor.findFirst({ where: { publicBooking: true, active: true } });
    const programs = await this.prisma.program.findMany({
      where: { active: true },
      select: { id: true, name: true, level: true },
      orderBy: { name: 'asc' },
    });
    return {
      available: !!advisor,
      programs,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? null,
    };
  }

  async slots(from: string, to: string) {
    const advisor = await this.publicAdvisor();
    const slots = await this.booking.availableSlots(advisor.id, from, to);
    return slots.map((s) => ({ startUtc: s.startUtc.toISOString(), endUtc: s.endUtc.toISOString() }));
  }

  async book(dto: PublicBookDto) {
    const advisor = await this.publicAdvisor();
    const email = dto.email.trim().toLowerCase();

    // Link an existing applicant by email, or create a fresh lead.
    let applicant = await this.prisma.applicant.findUnique({ where: { email } });
    if (!applicant) {
      applicant = await this.applicants.create({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phone: dto.phone?.trim(),
        countryOfOrigin: dto.countryOfOrigin?.trim(),
        interests: dto.programInterest ? `Interested in: ${dto.programInterest}` : undefined,
        leadSource: 'public_booking',
      });
    }

    const consultation = await this.booking.book({
      applicantId: applicant.id,
      advisorId: advisor.id,
      scheduledStartUtc: dto.scheduledStartUtc,
      studentTimezone: dto.studentTimezone,
    });

    const local = DateTime.fromJSDate(consultation.scheduledStartUtc).setZone(dto.studentTimezone);
    return {
      booked: true,
      when: local.toFormat("cccc d LLLL yyyy 'at' HH:mm"),
      timezone: dto.studentTimezone,
      zoomJoinUrl: consultation.zoomJoinUrl ?? null,
    };
  }
}
