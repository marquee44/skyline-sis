// Thin client for the SIS API. The browser hits same-origin /api (nginx proxies
// to NestJS in prod; next.config rewrite in dev). The JWT lives in localStorage.

const TOKEN_KEY = 'skyline_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = Array.isArray(body?.message) ? body.message.join(', ') : (body?.message ?? msg);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body: unknown) =>
    request<T>(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};

// ── Types mirrored from the API (kept minimal) ──────────────────────────────
export interface University {
  id: string;
  name: string;
  shortName: string | null;
  country: string;
  notes: string | null;
  _count?: { programs: number };
}

export type ProgramLevel = 'BA' | 'MA' | 'MBA' | 'PhD' | 'professional';

export interface Program {
  id: string;
  universityId: string;
  name: string;
  level: ProgramLevel;
  ects: number | null;
  durationMonths: number | null;
  tuitionTotal: string;
  tuitionCurrency: string;
  active: boolean;
  university?: { id: string; name: string; shortName: string | null };
  _count?: { courses: number };
}

export interface Course {
  id: string;
  programId: string;
  name: string;
  moodleCourseId: number | null;
  sequence: number;
  program?: { id: string; name: string };
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'student' | 'staff' | 'admin';
}

export type ApplicantStage =
  | 'intake_started'
  | 'consultation_booked'
  | 'consultation_completed'
  | 'program_proposed'
  | 'program_approved'
  | 'program_confirmed'
  | 'documents_pending'
  | 'documents_verified'
  | 'invoice_issued'
  | 'payment_received'
  | 'enrolled'
  | 'active_student'
  | 'graduated'
  | 'withdrawn'
  | 'rejected';

export interface Applicant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  countryOfOrigin: string | null;
  residenceCity: string | null;
  interests: string | null;
  stage: ApplicantStage;
  programChoiceStatus: string;
  assignedAdvisor?: { id: string; name: string } | null;
  allowedNextStages: ApplicantStage[];
  createdAt: string;
}

export interface StageTransition {
  id: string;
  fromStage: ApplicantStage | null;
  toStage: ApplicantStage;
  note: string | null;
  byUserId: string | null;
  createdAt: string;
}
