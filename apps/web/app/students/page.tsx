'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type StudentOverviewRow } from '@/lib/api';

// Stage labels + ordering, mirrored from the pipeline.
const STAGE_LABEL: Record<string, string> = {
  intake_started: 'Intake',
  consultation_booked: 'Booked',
  consultation_completed: 'Consulted',
  program_proposed: 'Proposed',
  program_approved: 'Approved',
  program_confirmed: 'Confirmed',
  documents_pending: 'Docs pending',
  documents_verified: 'Docs verified',
  invoice_issued: 'Invoiced',
  payment_received: 'Paid',
  enrolled: 'Enrolled',
  active_student: 'Active',
  graduated: 'Graduated',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
};

export default function StudentsOverviewPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StudentOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<StudentOverviewRow[]>('/students/overview')
      .then(setRows)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.stage))), [rows]);

  const filtered = rows.filter((r) => {
    if (stageFilter && r.stage !== stageFilter) return false;
    if (q && !(`${r.name} ${r.email} ${r.program ?? ''}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  // Totals across the filtered view.
  const totals = filtered.reduce(
    (acc, r) => {
      acc.invoiced += Number(r.invoiced);
      acc.paid += Number(r.paid);
      acc.outstanding += Number(r.outstanding);
      return acc;
    },
    { invoiced: 0, paid: 0, outstanding: 0 },
  );

  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <main className="space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Students</h1>
        <nav className="flex gap-4 text-sm text-slate-500">
          <a href="/pipeline" className="hover:underline">Pipeline</a>
          <a href="/applicants" className="hover:underline">Applicants</a>
          <a href="/catalog" className="hover:underline">Catalog</a>
          <a href="/account" className="hover:underline">Account</a>
        </nav>
      </header>

      {error && <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          placeholder="Search name, email, program…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">All stages</option>
          {stages.map((s) => (<option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>))}
        </select>
        <span className="text-sm text-slate-400">{filtered.length} of {rows.length}</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Program</th>
              <th className="px-3 py-2">Semester</th>
              <th className="px-3 py-2 text-right">Invoiced</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Moodle</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
                <td className="px-3 py-2">
                  <a href={`/applicants/${r.id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">{r.name || '—'}</a>
                  <div className="text-xs text-slate-400">{r.email}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{STAGE_LABEL[r.stage] ?? r.stage}</span>
                </td>
                <td className="px-3 py-2">{r.program ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2">
                  {r.currentTerm ? (
                    <span className="flex items-center gap-1.5">
                      <span>{r.currentTerm}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        r.currentTermStatus === 'enrolled' ? 'bg-emerald-100 text-emerald-700'
                        : r.currentTermStatus === 'paid' ? 'bg-sky-100 text-sky-700'
                        : r.currentTermStatus === 'invoiced' ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'}`}>{r.currentTermStatus}</span>
                      {r.termsTotal > 0 && <span className="text-xs text-slate-400">{r.termsEnrolled}/{r.termsTotal}</span>}
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.invoiced}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.paid}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${Number(r.outstanding) > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{r.outstanding}</td>
                <td className="px-3 py-2">
                  {r.moodleUserId
                    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">#{r.moodleUserId}</span>
                    : <span className="text-xs text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No students match.</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm font-medium dark:border-slate-700 dark:bg-slate-900">
              <tr>
                <td className="px-3 py-2" colSpan={4}>Totals ({filtered[0].currency})</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.invoiced.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{totals.paid.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${totals.outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{totals.outstanding.toFixed(2)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Per-term enrollment columns arrive after the multi-semester rework (terms are billed one at a time).
      </p>
    </main>
  );
}
