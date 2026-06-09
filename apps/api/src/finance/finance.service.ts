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
  TermEnrollmentStatus,
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
      if (invoice.termId) {
        // Per-term: mark the term paid and enrol just that semester's courses.
        await this.prisma.termEnrollment.upsert({
          where: { applicantId_termId: { applicantId: invoice.applicantId, termId: invoice.termId } },
          update: { status: TermEnrollmentStatus.paid, invoiceId: invoice.id },
          create: { applicantId: invoice.applicantId, termId: invoice.termId, status: TermEnrollmentStatus.paid, invoiceId: invoice.id },
        });
        await this.enqueueProvisioning(invoice.applicantId, invoice.termId);
      } else {
        await this.enqueueProvisioning(invoice.applicantId);
      }
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

  // Admin overview: every applicant with where they are (stage, program) and what
  // they owe (invoiced / paid / outstanding) + Moodle status. One pass, no N+1.
  async studentsOverview() {
    const applicants = await this.prisma.applicant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        chosenProgram: { select: { name: true, _count: { select: { terms: true } } } },
        invoices: {
          where: { status: { not: InvoiceStatus.cancelled } },
          include: { payments: { select: { amount: true } } },
        },
        termEnrollments: { include: { term: { select: { name: true, sequence: true } } } },
      },
    });
    return applicants.map((a) => {
      let invoiced = new Prisma.Decimal(0);
      let paid = new Prisma.Decimal(0);
      for (const inv of a.invoices) {
        invoiced = invoiced.plus(inv.amountTotal);
        for (const p of inv.payments) paid = paid.plus(p.amount);
      }
      // The latest term the student has reached (highest sequence), + progress.
      const sorted = [...a.termEnrollments].sort((x, y) => y.term.sequence - x.term.sequence);
      const current = sorted[0];
      const termsEnrolled = a.termEnrollments.filter((te) => te.status === TermEnrollmentStatus.enrolled).length;
      return {
        id: a.id,
        name: `${a.firstName} ${a.lastName}`.trim(),
        email: a.email,
        stage: a.stage,
        programChoiceStatus: a.programChoiceStatus,
        program: a.chosenProgram?.name ?? null,
        currency: a.invoices[0]?.currency ?? 'AED',
        invoiced: invoiced.toFixed(2),
        paid: paid.toFixed(2),
        outstanding: invoiced.minus(paid).toFixed(2),
        moodleUserId: a.moodleUserId,
        currentTerm: current?.term.name ?? null,
        currentTermStatus: current?.status ?? null,
        termsEnrolled,
        termsTotal: a.chosenProgram?._count.terms ?? 0,
      };
    });
  }

  // Finance report: overall totals + breakdowns by program, by term, and the
  // list of students who still owe. One query, aggregated in memory.
  async financeReport() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { not: InvoiceStatus.cancelled } },
      include: {
        payments: { select: { amount: true } },
        program: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        applicant: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    type Agg = { key: string; name: string; invoiced: Prisma.Decimal; paid: Prisma.Decimal };
    const bump = (m: Map<string, Agg>, key: string, name: string, inv: Prisma.Decimal, paid: Prisma.Decimal) => {
      const a = m.get(key) ?? { key, name, invoiced: new Prisma.Decimal(0), paid: new Prisma.Decimal(0) };
      a.invoiced = a.invoiced.plus(inv);
      a.paid = a.paid.plus(paid);
      m.set(key, a);
    };

    let invTot = new Prisma.Decimal(0);
    let paidTot = new Prisma.Decimal(0);
    let currency = 'AED';
    const byProgram = new Map<string, Agg>();
    const byTerm = new Map<string, Agg>();
    const byApplicant = new Map<string, Agg>();

    for (const inv of invoices) {
      currency = inv.currency ?? currency;
      const paid = inv.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      invTot = invTot.plus(inv.amountTotal);
      paidTot = paidTot.plus(paid);
      bump(byProgram, inv.program?.id ?? 'none', inv.program?.name ?? '—', inv.amountTotal, paid);
      bump(
        byTerm,
        inv.term?.id ?? 'none',
        inv.term ? `${inv.program?.name ?? ''} · ${inv.term.name}` : '— (no term)',
        inv.amountTotal,
        paid,
      );
      bump(byApplicant, inv.applicant.id, `${inv.applicant.firstName} ${inv.applicant.lastName}`.trim(), inv.amountTotal, paid);
    }

    const out = (m: Map<string, Agg>) =>
      Array.from(m.values())
        .map((a) => ({
          name: a.name,
          invoiced: a.invoiced.toFixed(2),
          paid: a.paid.toFixed(2),
          outstanding: a.invoiced.minus(a.paid).toFixed(2),
        }))
        .sort((x, y) => Number(y.invoiced) - Number(x.invoiced));

    return {
      currency,
      totals: {
        invoiced: invTot.toFixed(2),
        paid: paidTot.toFixed(2),
        outstanding: invTot.minus(paidTot).toFixed(2),
      },
      byProgram: out(byProgram),
      byTerm: out(byTerm),
      outstanding: out(byApplicant)
        .filter((a) => Number(a.outstanding) > 0)
        .sort((x, y) => Number(y.outstanding) - Number(x.outstanding)),
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

  private async enqueueProvisioning(applicantId: string, termId?: string) {
    try {
      await this.jobs.enqueue(MOODLE_PROVISION_QUEUE, termId ? { applicantId, termId } : { applicantId });
      this.logger.log(`Enqueued Moodle provisioning for ${applicantId}${termId ? ` term ${termId}` : ''}`);
    } catch (e) {
      this.logger.warn(`Could not enqueue provisioning: ${(e as Error).message}`);
    }
  }

  // ── Per-term (per-semester) billing ──────────────────────────────────────────

  /** The chosen program's terms with this applicant's per-term status + money. */
  async listApplicantTerms(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant?.chosenProgramId) return [];
    const terms = await this.prisma.term.findMany({
      where: { programId: applicant.chosenProgramId },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { courses: true } }, enrollments: { where: { applicantId } } },
    });
    const pct = new Prisma.Decimal(applicant.scholarshipPercent ?? 0);
    const rows = await Promise.all(
      terms.map(async (t) => {
        const te = t.enrollments[0];
        let invoiceStatus: string | null = null;
        let paid = '0.00';
        if (te?.invoiceId) {
          const inv = await this.prisma.invoice.findUnique({ where: { id: te.invoiceId }, include: { payments: true } });
          if (inv) {
            invoiceStatus = inv.status;
            paid = inv.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0)).toFixed(2);
          }
        }
        const status = (te?.status ?? 'pending') as string;
        const netFee = t.tuitionTotal.times(new Prisma.Decimal(100).minus(pct)).dividedBy(100);
        return {
          termId: t.id,
          name: t.name,
          sequence: t.sequence,
          fee: t.tuitionTotal.toFixed(2),
          scholarshipPercent: pct.toFixed(2),
          netFee: netFee.toDecimalPlaces(2).toFixed(2),
          currency: t.tuitionCurrency,
          courses: t._count.courses,
          status,
          invoiceId: te?.invoiceId ?? null,
          invoiceStatus,
          paid,
          locked: false, // set below
        };
      }),
    );
    // A term is locked until every earlier semester is paid/enrolled (terms are
    // sequence-ordered above, so a single forward pass sets it).
    let allPrevDone = true;
    for (const r of rows) {
      r.locked = !allPrevDone;
      if (r.status !== 'paid' && r.status !== 'enrolled') allPrevDone = false;
    }
    return rows;
  }

  /** Progress toward completing the chosen program: semesters done vs. remaining. */
  async degreeAudit(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      select: { stage: true, chosenProgramId: true, chosenProgram: { select: { name: true, level: true } } },
    });
    const empty = {
      program: applicant?.chosenProgram?.name ?? null,
      level: applicant?.chosenProgram?.level ?? null,
      totalTerms: 0, completed: 0, remaining: 0, percent: 0,
      currentTerm: null as string | null, nextTerm: null as string | null,
      graduationEligible: false, graduated: applicant?.stage === ApplicantStage.graduated,
    };
    if (!applicant?.chosenProgramId) return empty;
    const terms = await this.prisma.term.findMany({
      where: { programId: applicant.chosenProgramId },
      orderBy: { sequence: 'asc' },
      include: { enrollments: { where: { applicantId } } },
    });
    const total = terms.length;
    const isDone = (t: (typeof terms)[number]) => t.enrollments[0]?.status === TermEnrollmentStatus.enrolled;
    const completed = terms.filter(isDone).length;
    const lastDone = [...terms].reverse().find(isDone);
    const next = terms.find((t) => !isDone(t));
    return {
      ...empty,
      totalTerms: total,
      completed,
      remaining: total - completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      currentTerm: lastDone?.name ?? null,
      nextTerm: next?.name ?? null,
      graduationEligible: total > 0 && completed === total,
    };
  }

  /** Issue an invoice for one term (per-semester billing). Idempotent per term. */
  async invoiceTerm(applicantId: string, termId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('Applicant not found');
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new BadRequestException('Term not found');
    if (applicant.chosenProgramId !== term.programId) {
      throw new BadRequestException("Term is not part of the applicant's chosen program");
    }
    // Sequence gate: every earlier semester must be paid/enrolled first.
    const earlier = await this.prisma.term.findMany({
      where: { programId: term.programId, sequence: { lt: term.sequence } },
      orderBy: { sequence: 'asc' },
      include: { enrollments: { where: { applicantId } } },
    });
    const blocking = earlier.find((t) => {
      const st = t.enrollments[0]?.status;
      return st !== TermEnrollmentStatus.paid && st !== TermEnrollmentStatus.enrolled;
    });
    if (blocking) {
      throw new BadRequestException(`Pay ${blocking.name} before invoicing ${term.name}`);
    }
    const existing = await this.prisma.invoice.findFirst({
      where: { applicantId, termId, status: { not: InvoiceStatus.cancelled } },
    });
    if (existing) return existing;
    // Apply the student's scholarship/discount to the term fee.
    const pct = new Prisma.Decimal(applicant.scholarshipPercent ?? 0);
    const amountTotal = term.tuitionTotal.times(new Prisma.Decimal(100).minus(pct)).dividedBy(100).toDecimalPlaces(2);
    const invoice = await this.prisma.invoice.create({
      data: {
        applicantId,
        programId: term.programId,
        termId,
        amountTotal,
        currency: term.tuitionCurrency,
        status: InvoiceStatus.issued,
        issuedAt: new Date(),
      },
    });
    await this.prisma.termEnrollment.upsert({
      where: { applicantId_termId: { applicantId, termId } },
      update: { status: TermEnrollmentStatus.invoiced, invoiceId: invoice.id },
      create: { applicantId, termId, status: TermEnrollmentStatus.invoiced, invoiceId: invoice.id },
    });
    return invoice;
  }
}
