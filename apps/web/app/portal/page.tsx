'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type MeOverview } from '@/lib/api';

const STAGE_LABEL: Record<string, string> = {
  intake_started: 'Application started',
  consultation_booked: 'Consultation booked',
  consultation_completed: 'Consultation done',
  program_proposed: 'Program proposed',
  program_approved: 'Program approved',
  program_confirmed: 'Program confirmed',
  documents_pending: 'Documents pending',
  documents_verified: 'Documents verified',
  invoice_issued: 'Invoiced',
  payment_received: 'Payment received',
  enrolled: 'Enrolled',
  active_student: 'Active student',
  graduated: 'Graduated',
};

const MOODLE_URL = 'https://lms.skyline-as.ae';

export default function PortalPage() {
  const router = useRouter();
  const [data, setData] = useState<MeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<MeOverview>('/me/overview')
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
        setError(err instanceof Error ? err.message : 'Failed to load');
      });
  }, [router]);

  if (error) return <main className="mx-auto max-w-2xl px-6 py-10"><p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p></main>;
  if (!data) return <p className="p-8 text-slate-500">Loading…</p>;

  const { applicant, terms, balance, documents } = data;
  const owes = Number(balance.outstanding) > 0;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hi {applicant.firstName}</h1>
          <p className="text-sm text-slate-500">
            {applicant.chosenProgram ? `${applicant.chosenProgram.name} (${applicant.chosenProgram.level})` : 'No program selected yet'}
            {' · '}<span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{STAGE_LABEL[applicant.stage] ?? applicant.stage}</span>
          </p>
        </div>
        <button onClick={() => { setToken(null); router.push('/login'); }} className="text-sm text-slate-500 hover:underline">Sign out</button>
      </header>

      {/* Semesters */}
      <Card title="My semesters">
        {terms.length === 0 ? (
          <p className="text-sm text-slate-400">Your semesters appear here once your program is confirmed.</p>
        ) : (
          <ul className="space-y-2">
            {terms.map((t) => (
              <li key={t.termId} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span className="font-medium">{t.name}</span>
                <StatusPill status={t.status} />
                <span className="text-slate-400">{t.fee} {t.currency} · {t.courses} courses{Number(t.paid) > 0 ? ` · paid ${t.paid}` : ''}</span>
                {t.status === 'enrolled' && applicant.moodleUserId && (
                  <a href={MOODLE_URL} target="_blank" rel="noreferrer" className="ml-auto text-xs text-sky-600 hover:underline">open in Moodle →</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Money */}
      <Card title="Fees">
        <p className="text-sm">
          Invoiced <strong>{balance.invoiced}</strong> · Paid <strong className="text-emerald-600">{balance.paid}</strong> ·{' '}
          Outstanding <strong className={owes ? 'text-rose-600' : 'text-slate-500'}>{balance.outstanding}</strong> {balance.currency}
        </p>
        {owes && <p className="mt-1 text-xs text-slate-400">Online payment is coming soon — for now, contact the office to settle your balance.</p>}
      </Card>

      {/* Documents */}
      <Card title="My documents">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">No documents requested.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <span className="font-medium">{d.type}</span>
                <StatusPill status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {applicant.moodleUserId && (
        <a href={MOODLE_URL} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
          Go to my courses (Moodle) →
        </a>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const color: Record<string, string> = {
    enrolled: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-sky-100 text-sky-700',
    verified: 'bg-emerald-100 text-emerald-700',
    invoiced: 'bg-amber-100 text-amber-700',
    pending: 'bg-slate-100 text-slate-600',
    required: 'bg-amber-100 text-amber-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${color[status] ?? 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}
