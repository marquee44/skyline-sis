'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  getToken,
  setToken,
  type Applicant,
  type ApplicantStage,
  type StageTransition,
} from '@/lib/api';

const STAGE_LABEL: Record<ApplicantStage, string> = {
  intake_started: 'Intake started',
  consultation_booked: 'Consultation booked',
  consultation_completed: 'Consultation completed',
  program_proposed: 'Program proposed',
  program_approved: 'Program approved',
  program_confirmed: 'Program confirmed',
  documents_pending: 'Documents pending',
  documents_verified: 'Documents verified',
  invoice_issued: 'Invoice issued',
  payment_received: 'Payment received',
  enrolled: 'Enrolled',
  active_student: 'Active student',
  graduated: 'Graduated',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
};

function stageColor(s: ApplicantStage): string {
  if (s === 'graduated' || s === 'active_student' || s === 'enrolled')
    return 'bg-emerald-100 text-emerald-700';
  if (s === 'withdrawn' || s === 'rejected') return 'bg-rose-100 text-rose-700';
  return 'bg-sky-100 text-sky-700';
}

export default function ApplicantsPage() {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setApplicants(await api.get<Applicant[]>('/applicants'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    reload();
  }, [reload, router]);

  async function doTransition(id: string, toStage: ApplicantStage) {
    try {
      await api.post(`/applicants/${id}/transition`, { toStage });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    }
  }

  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Applicants ({applicants.length})</h1>
        <nav className="flex gap-4 text-sm text-slate-500">
          <a href="/catalog" className="hover:underline">Catalog</a>
          <button onClick={() => { setToken(null); router.push('/login'); }} className="hover:underline">
            Sign out
          </button>
        </nav>
      </header>
      {error && <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <CreateApplicant onChange={reload} setError={setError} />

      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {applicants.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <button
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  className="font-medium hover:underline"
                >
                  {a.firstName} {a.lastName}
                </button>
                <span className="ml-2 text-sm text-slate-400">{a.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stageColor(a.stage)}`}>
                  {STAGE_LABEL[a.stage]}
                </span>
                {a.allowedNextStages.length > 0 && (
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) doTransition(a.id, e.target.value as ApplicantStage);
                    }}
                  >
                    <option value="">Move to…</option>
                    {a.allowedNextStages.map((s) => (
                      <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {expanded === a.id && <History applicantId={a.id} />}
          </li>
        ))}
        {applicants.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-400">No applicants yet.</li>
        )}
      </ul>
    </main>
  );
}

function History({ applicantId }: { applicantId: string }) {
  const [items, setItems] = useState<StageTransition[] | null>(null);
  useEffect(() => {
    api.get<StageTransition[]>(`/applicants/${applicantId}/history`).then(setItems).catch(() => setItems([]));
  }, [applicantId]);
  if (!items) return <p className="mt-2 text-xs text-slate-400">Loading history…</p>;
  return (
    <ol className="mt-3 space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-500 dark:border-slate-700">
      {items.map((t) => (
        <li key={t.id}>
          <span className="font-medium">{t.fromStage ?? '—'} → {t.toStage}</span>
          {t.note ? ` · ${t.note}` : ''}{' '}
          <span className="text-slate-400">{new Date(t.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

function CreateApplicant({
  onChange,
  setError,
}: {
  onChange: () => void;
  setError: (e: string | null) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const inputCls =
    'rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post('/applicants', { firstName, lastName, email });
          setFirstName(''); setLastName(''); setEmail('');
          setError(null);
          onChange();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Create failed');
        }
      }}
    >
      <input className={inputCls} placeholder="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      <input className={inputCls} placeholder="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
      <input className={inputCls} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700" type="submit">
        Add applicant
      </button>
    </form>
  );
}
