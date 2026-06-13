import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ApplicantStage, DocumentStatus, InvoiceStatus, Prisma } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';

const SCAN_QUEUE = 'dunning-scan';
const TERMINAL: ApplicantStage[] = [ApplicantStage.withdrawn, ApplicantStage.rejected, ApplicantStage.graduated];

/**
 * Dunning: a scheduled scan nudges students about (1) overdue invoices and
 * (2) still-missing required documents. Each nudge stamps reminder_sent_at so a
 * student is reminded at most once per re-nudge window — never spammed.
 */
@Injectable()
export class DunningService implements OnModuleInit {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.jobs.createQueue(SCAN_QUEUE);
    await this.jobs.work(SCAN_QUEUE, async () => { await this.scan(); });
    const cron = process.env.DUNNING_SCAN_CRON ?? '0 9 * * *'; // daily 09:00 UTC
    await this.jobs.schedule(SCAN_QUEUE, cron);
    this.logger.log(`Dunning scan scheduled (${cron})`);
  }

  async scan(): Promise<{ invoices: number; documents: number }> {
    const afterDays = Number(process.env.DUNNING_INVOICE_AFTER_DAYS ?? 3); // grace before first nudge
    const renudgeDays = Number(process.env.DUNNING_RENUDGE_DAYS ?? 7); // gap between nudges
    const now = Date.now();
    const issuedBefore = new Date(now - afterDays * 86400000);
    const staleBefore = new Date(now - renudgeDays * 86400000);
    const throttle = [{ reminderSentAt: null }, { reminderSentAt: { lte: staleBefore } }];

    // (1) Overdue invoices — issued/partially-paid, past the grace window, not recently nudged.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.issued, InvoiceStatus.partially_paid] },
        issuedAt: { lte: issuedBefore },
        OR: throttle,
      },
      include: { payments: true, term: { select: { name: true } }, applicant: { select: { firstName: true, email: true } } },
    });
    let invCount = 0;
    for (const inv of invoices) {
      const paid = inv.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      const outstanding = inv.amountTotal.minus(paid);
      if (outstanding.lte(0)) continue;
      await this.notifications.paymentReminder(inv.applicant, outstanding.toDecimalPlaces(2).toString(), inv.currency, inv.term?.name);
      await this.prisma.invoice.update({ where: { id: inv.id }, data: { reminderSentAt: new Date() } });
      invCount++;
    }

    // (2) Missing required documents — no file, not deleted, active applicant, not recently nudged.
    const docs = await this.prisma.document.findMany({
      where: {
        status: DocumentStatus.required,
        filePath: null,
        deletedAt: null,
        OR: throttle,
        applicant: { stage: { notIn: TERMINAL } },
      },
      include: { applicant: { select: { firstName: true, email: true } } },
    });
    let docCount = 0;
    for (const d of docs) {
      await this.notifications.documentReminder(d.applicant, d.type);
      await this.prisma.document.update({ where: { id: d.id }, data: { reminderSentAt: new Date() } });
      docCount++;
    }

    if (invCount || docCount) this.logger.log(`Dunning: ${invCount} payment + ${docCount} document reminder(s)`);
    return { invoices: invCount, documents: docCount };
  }
}
