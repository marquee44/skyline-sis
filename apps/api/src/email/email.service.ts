import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email abstraction (spec section 2: transactional provider via its SDK).
 * v1 ships a logging transport so the rest of the system can depend on it
 * without provider credentials. Swapping to Resend/Postmark/SendGrid later is a
 * change to `send()` only — callers don't change.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async send(msg: EmailMessage): Promise<void> {
    const provider = process.env.EMAIL_API_KEY;
    if (!provider) {
      this.logger.log(`[email:log-transport] to=${msg.to} subject="${msg.subject}"`);
      this.logger.debug(msg.text);
      return;
    }
    // TODO(increment 6+): real provider SDK call here.
    this.logger.log(`[email:provider] to=${msg.to} subject="${msg.subject}"`);
  }
}
