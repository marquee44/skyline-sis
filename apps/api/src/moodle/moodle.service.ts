import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

interface MoodleUser {
  id: number;
  email?: string;
  username?: string;
}

/**
 * Moodle Web Services REST client (spec section 12). One direction for
 * provisioning: SIS → Moodle. Token is a secret env var; the SIS calls Moodle,
 * never the reverse. Unconfigured → throws ServiceUnavailable so the job retries
 * once credentials exist, rather than silently "succeeding".
 */
@Injectable()
export class MoodleService {
  private readonly logger = new Logger(MoodleService.name);

  get configured(): boolean {
    return Boolean(process.env.MOODLE_BASE_URL && process.env.MOODLE_WS_TOKEN);
  }

  private studentRoleId(): number {
    return Number(process.env.MOODLE_STUDENT_ROLEID ?? 5); // 5 = student in stock Moodle
  }

  private async call<T>(wsfunction: string, params: Record<string, unknown>): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException('Moodle is not configured (MOODLE_BASE_URL/MOODLE_WS_TOKEN)');
    }
    const base = process.env.MOODLE_BASE_URL!.replace(/\/$/, '');
    const url = `${base}/webservice/rest/server.php`;
    const body = new URLSearchParams({
      wstoken: process.env.MOODLE_WS_TOKEN!,
      wsfunction,
      moodlewsrestformat: 'json',
      ...flatten(params),
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    // Moodle returns HTTP 200 with an `exception` field on errors.
    if (data && typeof data === 'object' && 'exception' in data) {
      throw new Error(`Moodle ${wsfunction}: ${(data as { message?: string }).message ?? 'error'}`);
    }
    return data as T;
  }

  async findUserByEmail(email: string): Promise<MoodleUser | null> {
    const users = await this.call<MoodleUser[]>('core_user_get_users_by_field', {
      field: 'email',
      'values[0]': email,
    });
    return Array.isArray(users) && users.length ? users[0] : null;
  }

  async createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    username?: string;
  }): Promise<number> {
    const username = (input.username ?? input.email).toLowerCase();
    const created = await this.call<MoodleUser[]>('core_user_create_users', {
      'users[0][username]': username,
      'users[0][email]': input.email,
      'users[0][firstname]': input.firstName,
      'users[0][lastname]': input.lastName,
      'users[0][auth]': 'manual',
      // Random password; the student resets via Moodle. Never stored here.
      'users[0][createpassword]': 1,
    });
    if (!created?.[0]?.id) throw new Error('Moodle did not return a user id');
    return created[0].id;
  }

  async enrolInCourse(moodleUserId: number, moodleCourseId: number): Promise<void> {
    await this.call('enrol_manual_enrol_users', {
      'enrolments[0][roleid]': this.studentRoleId(),
      'enrolments[0][userid]': moodleUserId,
      'enrolments[0][courseid]': moodleCourseId,
    });
  }

  // ── Read-back (increment 14, read-only) ─────────────────────────────────────
  async courseCompletion(moodleUserId: number, moodleCourseId: number) {
    return this.call('core_completion_get_course_completion_status', {
      userid: moodleUserId,
      courseid: moodleCourseId,
    });
  }

  async gradeItems(moodleUserId: number, moodleCourseId: number) {
    return this.call('gradereport_user_get_grade_items', {
      userid: moodleUserId,
      courseid: moodleCourseId,
    });
  }
}

// Moodle expects repeated/array params as flat form keys; pass them pre-flattened.
function flatten(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) out[k] = String(v);
  return out;
}
