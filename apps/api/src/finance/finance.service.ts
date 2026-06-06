import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApplicantStage,
  InvoiceStatus,
  ProgramChoiceStatus,
  Prisma,
} from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicantsService } from '../applicants/applicants.service';
import { JobsService } from '../jobs/jobs.service';
import { MOODLE_PROVISION_QUEUE } from '../moodle/queue';
import { CreateForwardDto, CreateInvoiceDto, CreatePaymentDto } from './dto';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly applicants: ApplicantsService,
    private readonly jobs: JobsService,
  ) {}

  // The fraction of an invoice that must be paid to unlock Moodle provisioning
  // (spec section 9 key rule). 1.0 = fully paid; 0.5 = half, etc.
  private unlockThreshold(): number {
    const v = Number(process.env.FINANCE_UNLOCK_THRESHOLD ?? 1);
    return isNaN(v) || v <= 0 ? 1 : Math.min(v, 1);
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  async createInvoice(dto: CreateInvoiceDto) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: dto.applicantId } });
    if (!applicant) throw new BadRequestException('applicantId does not exist');
    if (applicant.programChoiceStatus !== ProgramChoiceStatus.confirmed) {
      throw new BadRequestException('No invoice until the program choice is confirmed');
    }
    const programId = dto.programId ?? applicant.chosenProgramId;
    if (!programId) throw new BadRequestException('No program to invoice for');
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new BadRequestException('programId does not exist');

    const amount = dto.amountTotal !== undefined
      ? new Prisma.Decimal(dto.amountTotal)
      : program.tuitionTotal;

    return this.prisma.invoice.create({
      data: {
        applicantId: dto.applicantId,
        programId,
        amountTotal: amount,
        currency: dto.currency ?? program.tuitionCurrency,
        status: InvoiceStatus.draft,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });
  }

  async issueInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.draft) {
      throw new BadRequestException('Only draft invoices can be issued');
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.issued, issuedAt: new Date() },
    });
    await this.advance(invoice.applicantId, ApplicantStage.documents_verified, ApplicantStage.invoice_issued, 'invoice issued');
    return updated;
  }

  listInvoices(applicantId?: string) {
    return this.prisma.invoice.findMany({
      where: applicantId ? { applicantId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { payments: true, program: { select: { id: true, name: true } } },
    });
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: { orderBy: { receivedAt: 'asc' } }, program: true, applicant: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // ── Payments (money IN) ─────────────────────────────────────────────────────
  async recordPayment(invoiceId: string, dto: CreatePaymentDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.cancelled) {
      throw new BadRequestException('Invoice is cancelled');
    }

    const payment = await this.prisma.payment.create({
      data: { invoiceId, amount: new Prisma.Decimal(dto.amount), method: dto.method, reference: dto.reference },
    });

    const paid = invoice.payments
      .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0))
      .plus(dto.amount);
    const total = invoice.amountTotal;
    const status = paid.gte(total)
      ? InvoiceStatus.paid
      : paid.gt(0)
        ? InvoiceStatus.partially_paid
        : InvoiceStatus.issued;

    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status } });

    // Moodle unlock: paid fraction past the configured threshold.
    const unlocked = total.gt(0) && paid.gte(total.times(this.unlockThreshold()));
    if (unlocked) {
      await this.advance(invoice.applicantId, ApplicantStage.invoice_issued, ApplicantStage.payment_received, 'payment threshold reached');
      await this.enqueueProvisioning(invoice.applicantId);
    }

    return { payment, invoiceStatus: status, unlocked };
  }

  // ── Forwards (money OUT) ────────────────────────────────────────────────────
  async recordForward(dto: CreateForwardDto) {
    const [uni, applicant] = await Promise.all([
      this.prisma.university.findUnique({ where: { id: dto.universityId } }),
      this.prisma.applicant.findUnique({ where: { id: dto.applicantId } }),
    ]);
    if (!uni) throw new BadRequestException('universityId does not exist');
    if (!applicant) throw new BadRequestException('applicantId does not exist');
    return this.prisma.forward.create({
      data: {
        universityId: dto.universityId,
        applicantId: dto.applicantId,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'RSD',
        reference: dto.reference,
        notes: dto.notes,
      },
    });
  }

  // ── Balances ────────────────────────────────────────────────────────────────
  async applicantBalance(applicantId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { applicantId, status: { not: InvoiceStatus.cancelled } },
      include: { payments: true },
    });
    let invoiced = new Prisma.Decimal(0);
    let paid = new Prisma.Decimal(0);
    for (const inv of invoices) {
      invoiced = invoiced.plus(inv.amountTotal);
      for (const p of inv.payments) paid = paid.plus(p.amount);
    }
    const forwards = await this.prisma.forward.findMany({ where: { applicantId } });
    return {
      currency: invoices[0]?.currency ?? 'AED',
      invoiced: invoiced.toFixed(2),
      paid: paid.toFixed(2),
      outstanding: invoiced.minus(paid).toFixed(2),
      forwardedCount: forwards.length,
    };
  }

  async universityBalance(universityId: string) {
    const forwards = await this.prisma.forward.findMany({ where: { universityId } });
    const byCurrency: Record<string, Prisma.Decimal> = {};
    for (const f of forwards) {
      byCurrency[f.currency] = (byCurrency[f.currency] ?? new Prisma.Decimal(0)).plus(f.amount);
    }
    return {
      forwards: forwards.length,
      totals: Object.fromEntries(Object.entries(byCurrency).map(([c, v]) => [c, v.toFixed(2)])),
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private async advance(applicantId: string, from: ApplicantStage, to: ApplicantStage, note: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (applicant?.stage === from) {
      await this.applicants.transition(applicantId, to, { note }).catch((e) =>
        this.logger.warn(`Stage advance ${from}→${to} failed: ${(e as Error).message}`),
      );
    }
  }

  private async enqueueProvisioning(applicantId: string) {
    try {
      await this.jobs.enqueue(MOODLE_PROVISION_QUEUE, { applicantId });
      this.logger.log(`Enqueued Moodle provisioning for ${applicantId}`);
    } catch (e) {
      this.logger.warn(`Could not enqueue provisioning: ${(e as Error).message}`);
    }
  }
}
