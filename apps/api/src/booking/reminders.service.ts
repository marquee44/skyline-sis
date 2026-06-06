import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ConsultationStatus } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JobsService } from '../jobs/jobs.service';

const SCAN_QUEUE = 'booking-reminder-scan';

/**
 * Booking reminder job (spec section 5). A pg-boss schedule fires a periodic
 * scan; the scan finds consultations starting within the lead window that
 * haven't been reminded yet, emails the student, and stamps reminder_sent_at so
 * each booking is reminded exactly once. Cancelled bookings are excluded, so a
 * cancelled call never produces a reminder.
 */
@Injectable()
export class BookingRemindersService implements OnModuleInit {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async onModuleInit() {
    await this.jobs.createQueue(SCAN_QUEUE);
    await this.jobs.work(SCAN_QUEUE, async () => {
      await this.scan();
    });
    const cron = process.env.REMINDER_SCAN_CRON ?? '*/5 * * * *';
    await this.jobs.schedule(SCAN_QUEUE, cron);
    this.logger.log(`Reminder scan scheduled (${cron})`);
  }

  async scan(): Promise<number> {
    const leadHours = Number(process.env.REMINDER_LEAD_HOURS ?? 24);
    const now = new Date();
    const until = new Date(now.getTime() + leadHours * 3600 * 1000);

    const due = await this.prisma.consultation.findMany({
      where: {
        status: ConsultationStatus.booked,
        reminderSentAt: null,
        scheduledStartUtc: { gt: now, lte: until },
      },
      include: { applicant: true, advisor: true },
    });

    for (const c of due) {
      const local = DateTime.fromJSDate(c.scheduledStartUtc).setZone(c.studentTimezone);
      const when = local.toFormat("cccc d LLLL 'at' HH:mm '('ZZZZ')'");
      const link = c.zoomJoinUrl ? `\nJoin: ${c.zoomJoinUrl}` : '';
      await this.email.send({
        to: c.applicant.email,
        subject: 'Reminder: your Skyline consultation is coming up',
        text:
          `Hi ${c.applicant.firstName},\n\n` +
          `This is a reminder of your consultation with ${c.advisor.name}:\n${when}${link}\n\n` +
          `— Skyline University Admission Services`,
      });
      await this.prisma.consultation.update({
        where: { id: c.id },
        data: { reminderSentAt: new Date() },
      });
    }

    if (due.length) this.logger.log(`Sent ${due.length} consultation reminder(s)`);
    return due.length;
  }
}
