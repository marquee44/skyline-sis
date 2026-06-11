'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type Applicant, type ApplicantStage } from '@/lib/api';
import { Shell } from '@/components/Shell';

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

  if (loading) return <Shell title="Pipeline"><p className="text-slate-400">Loading…</p></Shell>;

  const terminal = applicants.filter((a) => a.stage === 'withdrawn' || a.stage === 'rejected');

  return (
    <Shell title="Pipeline" subtitle={`${applicants.length} applicants`}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const items = applicants.filter((a) => a.stage === col.stage);
          return (
            <div key={col.stage} className="min-w-[180px] flex-1 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400">
                {col.label} · {items.length}
              </div>
              <ul className="space-y-2 p-2">
                {items.map((a) => (
                  <li key={a.id}>
                    <a href={`/applicants/${a.id}`} className="block rounded-lg bg-slate-800/60 px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
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
        <p className="mt-4 text-sm text-slate-500">Terminal: {terminal.length} withdrawn/rejected</p>
      )}
    </Shell>
  );
}
