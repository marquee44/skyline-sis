import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';

type Recipient = { firstName: string; email: string };

/**
 * Transactional email templates. Each method is fire-and-forget safe: it swallows
 * errors so a failed email never breaks the underlying operation. Delivery only
 * happens once EMAIL_API_KEY + EMAIL_FROM are set (otherwise EmailService logs).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly base = process.env.PORTAL_URL || 'https://sis.skyline-as.ae';
  private readonly sign = '\n— Skyline University Admission Services';

  constructor(private readonly email: EmailService) {}

  private async send(to: string, subject: string, lines: string[]) {
    try {
      await this.email.send({ to, subject, text: lines.join('\n') });
    } catch (e) {
      this.logger.warn(`notification "${subject}" to ${to} failed: ${(e as Error).message}`);
    }
  }

  studentLoginCreated(a: Recipient, tempPassword: string) {
    return this.send(a.email, 'Your Skyline student portal login', [
      `Hi ${a.firstName},`, '',
      `Your Skyline student portal is ready. Sign in here: ${this.base}/login`,
      `  Email: ${a.email}`,
      `  Temporary password: ${tempPassword}`,
      '', 'Please set your own password after signing in.',
      this.sign,
    ]);
  }

  invoiceIssued(a: Recipient, amount: string, currency: string, label?: string) {
    return this.send(a.email, `Invoice issued — ${amount} ${currency}`, [
      `Hi ${a.firstName},`, '',
      `An invoice has been issued${label ? ` for ${label}` : ''}: ${amount} ${currency}.`,
      `View and track it in your student portal: ${this.base}/portal`,
      this.sign,
    ]);
  }

  paymentReceipt(a: Recipient, amount: string, currency: string, outstanding: string) {
    return this.send(a.email, `Payment received — ${amount} ${currency}`, [
      `Hi ${a.firstName},`, '',
      `We've received your payment of ${amount} ${currency}. Thank you!`,
      `Remaining balance: ${outstanding} ${currency}.`,
      this.sign,
    ]);
  }

  documentRequested(a: Recipient, type: string) {
    return this.send(a.email, `Document requested: ${type}`, [
      `Hi ${a.firstName},`, '',
      `Please upload your "${type}" document in your student portal: ${this.base}/portal`,
      this.sign,
    ]);
  }

  paymentReminder(a: Recipient, amount: string, currency: string, label?: string) {
    return this.send(a.email, `Reminder: payment due — ${amount} ${currency}`, [
      `Hi ${a.firstName},`, '',
      `A friendly reminder that you have an outstanding balance${label ? ` for ${label}` : ''}: ${amount} ${currency}.`,
      `Review and settle it in your student portal: ${this.base}/portal`,
      this.sign,
    ]);
  }

  documentReminder(a: Recipient, type: string) {
    return this.send(a.email, `Reminder: please upload your ${type}`, [
      `Hi ${a.firstName},`, '',
      `We're still waiting for your "${type}" document to move your application forward.`,
      `Please upload it in your student portal: ${this.base}/portal`,
      this.sign,
    ]);
  }
}
