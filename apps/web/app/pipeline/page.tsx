'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type Applicant, type ApplicantStage } from '@/lib/api';

const COLUMNS: { stage: ApplicantStage; label: string }[] = [
  { stage: 'intake_started', label: 'Intake' },
  { stage: 'consultation_booked', label: 'Booked' },
  { stage: 'consultation_completed', label: 'Consulted' },
  { stage: 'program_proposed', label: 'Proposed' },
  { stage: 'program_approved', label: 'Approved' },
  { stage: 'program_confirmed', label: 'Confirmed' },
  { stage: 'documents_pending', label: 'Docs pending' },
  { stage: 'documents_verified', label: 'Docs verified' },
  { stage: 'invoice_issued', label: 'Invoiced' },
  { stage: 'payment_received', label: 'Paid' },
  { stage: 'enrolled', label: 'Enrolled' },
  { stage: 'active_student', label: 'Active' },
  { stage: 'graduated', label: 'Graduated' },
];

export default function PipelinePage() {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<Applicant[]>('/applicants')
      .then(setApplicants)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;

  const terminal = applicants.filter((a) => a.stage === 'withdrawn' || a.stage === 'rejected');

  return (
    <main className="space-y-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <nav className="flex gap-4 text-sm text-slate-500">
          <a href="/dashboard" className="hover:underline">Dashboard</a>
          <a href="/students" className="hover:underline">Students</a>
          <a href="/reports" className="hover:underline">Reports</a>
          <a href="/applicants" className="hover:underline">Applicants</a>
          <a href="/advisors" className="hover:underline">Advisors</a>
          <a href="/catalog" className="hover:underline">Catalog</a>
          <a href="/account" className="hover:underline">Account</a>
        </nav>
      </header>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const items = applicants.filter((a) => a.stage === col.stage);
          return (
            <div key={col.stage} className="min-w-[180px] flex-1 rounded-md border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800">
                {col.label} · {items.length}
              </div>
              <ul className="space-y-2 p-2">
                {items.map((a) => (
                  <li key={a.id}>
                    <a href={`/applicants/${a.id}`} className="block rounded-md bg-slate-50 px-2 py-1.5 text-sm hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800">
                      {a.firstName} {a.lastName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {terminal.length > 0 && (
        <p className="text-sm text-slate-400">
          Terminal: {terminal.length} withdrawn/rejected
        </p>
      )}
    </main>
  );
}
