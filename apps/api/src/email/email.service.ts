import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email abstraction. Sends via Resend's HTTP API when EMAIL_API_KEY + EMAIL_FROM
 * are set; otherwise falls back to a logging transport so the rest of the system
 * works without provider credentials (and never silently "succeeds" in prod
 * without us knowing — the fallback warns).
 *
 * To enable real delivery: create a Resend account, verify the sending domain
 * (DNS records), then set EMAIL_API_KEY=re_… and EMAIL_FROM="Skyline <no-reply@your-domain>".
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async send(msg: EmailMessage): Promise<void> {
    const key = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) {
      this.logger.warn(`[email:log-only] not sent (no EMAIL_API_KEY/EMAIL_FROM) to=${msg.to} subject="${msg.subject}"`);
      this.logger.debug(msg.text);
      return;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
      }
      this.logger.log(`[email:resend] sent to=${msg.to} subject="${msg.subject}"`);
    } catch (e) {
      // Don't let a mail failure break the booking/payment flow that triggered it.
      this.logger.error(`[email:resend] failed to=${msg.to}: ${(e as Error).message}`);
    }
  }
}
