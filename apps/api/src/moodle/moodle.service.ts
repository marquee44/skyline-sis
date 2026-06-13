import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

interface MoodleUser {
  id: number;
  email?: string;
  username?: string;
}

export interface MoodleCategory {
  id: number;
  name: string;
  parent: number; // 0 = top-level
  coursecount?: number;
}

export interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  categoryid: number;
}

export interface MoodleEnrolledUser {
  id: number;
  firstname: string;
  lastname: string;
  email?: string;
  roles?: { roleid: number; shortname: string; name?: string }[];
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
    // Moodle's default username charset is lowercase alphanumeric + ._-@. Email
    // aliases like "name+tag@host" are valid emails but invalid usernames, so
    // sanitize anything else to a dot (the email field keeps the original).
    const username = (input.username ?? input.email).toLowerCase().replace(/[^a-z0-9._@-]/g, '.');
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

  // One-time login URL for a student (via the local_sislogin bridge plugin), so
  // the SIS portal can drop them straight into Moodle as themselves.
  async requestLoginUrl(email: string): Promise<string> {
    const res = await this.call<{ loginurl: string }>('local_sislogin_request_login_url', { email });
    return res.loginurl;
  }

  // ── Catalog browse (for import + mapping) ───────────────────────────────────
  async getCategories(): Promise<MoodleCategory[]> {
    const cats = await this.call<MoodleCategory[]>('core_course_get_categories', {});
    return Array.isArray(cats) ? cats : [];
  }

  async getCourses(): Promise<MoodleCourse[]> {
    const courses = await this.call<MoodleCourse[]>('core_course_get_courses', {});
    // id 1 is Moodle's site (front page) "course" — never a real course.
    return Array.isArray(courses) ? courses.filter((c) => c.id !== 1) : [];
  }

  // Enrolled users for a course, with their roles (used to pick out teachers).
  async enrolledUsers(moodleCourseId: number): Promise<MoodleEnrolledUser[]> {
    const users = await this.call<MoodleEnrolledUser[]>('core_enrol_get_enrolled_users', {
      courseid: moodleCourseId,
    });
    return Array.isArray(users) ? users : [];
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
