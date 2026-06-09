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

export interface MoodleCategory {
  id: number;
  name: string;
  parent: number;
  coursecount?: number;
}

export interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  categoryid: number;
}

export interface ImportSummary {
  universities: number;
  programs: number;
  terms: number;
  courses: number;
  skipped: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'student' | 'staff' | 'admin';
  applicantId?: string | null;
}

export interface DegreeAudit {
  program: string | null;
  level: string | null;
  totalTerms: number;
  completed: number;
  remaining: number;
  percent: number;
  currentTerm: string | null;
  nextTerm: string | null;
  graduationEligible: boolean;
  graduated: boolean;
}

export interface MeOverview {
  applicant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    stage: ApplicantStage;
    programChoiceStatus: string;
    moodleUserId: number | null;
    chosenProgram: { id: string; name: string; level: string } | null;
  };
  terms: ApplicantTermRow[];
  balance: Balance;
  documents: { id: string; type: string; status: string }[];
  audit: DegreeAudit;
}

export interface CatalogTerm {
  id: string;
  name: string;
  sequence: number;
  tuitionTotal: string;
  tuitionCurrency: string;
  active: boolean;
  _count?: { courses: number };
}

export interface ApplicantTermRow {
  termId: string;
  name: string;
  sequence: number;
  fee: string;
  currency: string;
  courses: number;
  status: 'pending' | 'invoiced' | 'paid' | 'enrolled' | string;
  invoiceId: string | null;
  invoiceStatus: string | null;
  paid: string;
  locked: boolean;
}

export interface FinanceReportRow {
  name: string;
  invoiced: string;
  paid: string;
  outstanding: string;
}

export interface FinanceReport {
  currency: string;
  totals: { invoiced: string; paid: string; outstanding: string };
  byProgram: FinanceReportRow[];
  byTerm: FinanceReportRow[];
  outstanding: FinanceReportRow[];
}

export interface StudentOverviewRow {
  id: string;
  name: string;
  email: string;
  stage: ApplicantStage;
  programChoiceStatus: string;
  program: string | null;
  currency: string;
  invoiced: string;
  paid: string;
  outstanding: string;
  moodleUserId: number | null;
  currentTerm: string | null;
  currentTermStatus: 'pending' | 'invoiced' | 'paid' | 'enrolled' | null;
  termsEnrolled: number;
  termsTotal: number;
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

export interface AvailabilityRule {
  id: string;
  advisorId: string;
  weekday: number; // 0=Sun … 6=Sat
  startTime: string;
  endTime: string;
  slotMinutes: number;
  timezone: string;
}

export interface Advisor {
  id: string;
  name: string;
  email: string;
  active: boolean;
  availabilityRules: AvailabilityRule[];
}

export interface Slot {
  startUtc: string;
  endUtc: string;
}

export interface ApplicantDetail extends Applicant {
  programChoiceStatus: 'none' | 'proposed' | 'approved' | 'rejected' | 'confirmed';
  proposedProgram?: { id: string; name: string } | null;
  chosenProgram?: { id: string; name: string } | null;
  choiceAdvisorNote?: string | null;
  moodleUserId?: number | null;
  stageTransitions?: StageTransition[];
}

export interface DocumentRec {
  id: string;
  applicantId: string;
  type: string;
  status: 'required' | 'uploaded' | 'verified' | 'rejected';
  filePath: string | null;
  notes: string | null;
}

export interface Invoice {
  id: string;
  applicantId: string;
  programId: string;
  amountTotal: string;
  currency: string;
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';
  issuedAt: string | null;
  payments?: { id: string; amount: string; method: string; receivedAt: string }[];
  program?: { id: string; name: string };
}

export interface Balance {
  currency: string;
  invoiced: string;
  paid: string;
  outstanding: string;
  forwardedCount: number;
}

export interface Consultation {
  id: string;
  applicantId: string;
  advisorId: string;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  studentTimezone: string;
  status: 'booked' | 'completed' | 'cancelled' | 'no_show';
  zoomJoinUrl: string | null;
  advisor?: { id: string; name: string };
  applicant?: { id: string; firstName: string; lastName: string; email: string };
}
