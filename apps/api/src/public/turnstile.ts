import { Logger } from '@nestjs/common';

const logger = new Logger('Turnstile');

/**
 * Verify a Cloudflare Turnstile token server-side. If TURNSTILE_SECRET_KEY isn't
 * set we skip verification (so the form works before keys are added) — set the key
 * in production to actually enforce it.
 */
export async function verifyTurnstile(token: string | undefined, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured yet — don't block bookings
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    logger.warn(`Turnstile verify failed: ${(e as Error).message}`);
    return false;
  }
}
