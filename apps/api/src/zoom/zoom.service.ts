import { Injectable, Logger } from '@nestjs/common';

export interface ZoomMeetingRequest {
  topic: string;
  startUtc: Date;
  durationMinutes: number;
  timezone: string;
  agenda?: string;
}

/**
 * Zoom meeting creation (spec section 5). Uses Server-to-Server OAuth when
 * credentials are configured; otherwise returns the pasted standing-link
 * fallback (ZOOM_FALLBACK_LINK) — exactly the v1 degradation the spec calls for.
 * The SIS calls Zoom, never the reverse.
 */
@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);

  private get configured(): boolean {
    return Boolean(
      process.env.ZOOM_ACCOUNT_ID &&
        process.env.ZOOM_CLIENT_ID &&
        process.env.ZOOM_CLIENT_SECRET,
    );
  }

  async createMeeting(req: ZoomMeetingRequest): Promise<string | null> {
    if (!this.configured) {
      return process.env.ZOOM_FALLBACK_LINK || null;
    }
    try {
      const token = await this.accessToken();
      const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: req.topic,
          type: 2, // scheduled
          start_time: req.startUtc.toISOString(),
          duration: req.durationMinutes,
          timezone: req.timezone,
          agenda: req.agenda,
          settings: { join_before_host: true, waiting_room: false },
        }),
      });
      if (!res.ok) throw new Error(`Zoom API ${res.status}: ${await res.text()}`);
      const meeting = (await res.json()) as { join_url?: string };
      return meeting.join_url ?? process.env.ZOOM_FALLBACK_LINK ?? null;
    } catch (e) {
      this.logger.warn(`Zoom meeting creation failed, using fallback: ${(e as Error).message}`);
      return process.env.ZOOM_FALLBACK_LINK || null;
    }
  }

  private async accessToken(): Promise<string> {
    const basic = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`,
    ).toString('base64');
    const url =
      'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' +
      encodeURIComponent(process.env.ZOOM_ACCOUNT_ID as string);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) throw new Error(`Zoom OAuth ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
}
