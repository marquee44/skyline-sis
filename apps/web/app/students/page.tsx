'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type StudentOverviewRow, type AtRiskRow } from '@/lib/api';
import { Shell, Card, dInput } from '@/components/Shell';

const STAGE_LABEL: Record<string, string> = {
  intake_started: 'Intake', consultation_booked: 'Booked', consultation_completed: 'Consulted',
  program_proposed: 'Proposed', program_approved: 'Approved', program_confirmed: 'Confirmed',
  documents_pending: 'Docs pending', documents_verified: 'Docs verified', invoice_issued: 'Invoiced',
  payment_received: 'Paid', enrolled: 'Enrolled', active_student: 'Active', graduated: 'Graduated',
  withdrawn: 'Withdrawn', rejected: 'Rejected',
};

function stagePill(s: string): string {
  if (['active_student', 'enrolled', 'graduated'].includes(s)) return 'bg-emerald-500/15 text-emerald-300';
  if (['withdrawn', 'rejected'].includes(s)) return 'bg-rose-500/15 text-rose-300';
  return 'bg-sky-500/15 text-sky-300';
}
const fmt = (n: string | number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function StudentsOverviewPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StudentOverviewRow[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    Promise.all([
      api.get<StudentOverviewRow[]>('/students/overview'),
      api.get<AtRiskRow[]>('/reports/at-risk'),
    ])
      .then(([ov, ar]) => { setRows(ov); setAtRisk(ar); })
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
  const totals = filtered.reduce((a, r) => ({ invoiced: a.invoiced + +r.invoiced, paid: a.paid + +r.paid, outstanding: a.outstanding + +r.outstanding }), { invoiced: 0, paid: 0, outstanding: 0 });
  const active = rows.filter((r) => ['active_student', 'enrolled', 'graduated'].includes(r.stage)).length;

  if (loading) return <Shell title="Students"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Students" subtitle={`${rows.length} total · ${active} active`}>
      {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Mini label="Total students" value={fmt(rows.length)} />
        <Mini label="Active" value={fmt(active)} />
        <Mini label="Collected" value={`${fmt(totals.paid)}`} accent="text-emerald-300" />
        <Mini label="Outstanding" value={`${fmt(totals.outstanding)}`} accent={totals.outstanding > 0 ? 'text-rose-300' : 'text-slate-300'} />
      </div>

      {atRisk.length > 0 && (
        <Card title={`⚠️ Needs attention (${atRisk.length})`} className="mb-6 border-amber-700/40 bg-amber-950/20">
          <ul className="space-y-1.5 text-sm">
            {atRisk.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <a href={`/applicants/${a.id}`} className="font-medium text-amber-200 hover:underline">{a.name}</a>
                <span className="text-xs text-slate-400">{STAGE_LABEL[a.stage] ?? a.stage}{a.program ? ` · ${a.program}` : ''}</span>
                {a.reasons.map((r, i) => <span key={i} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">{r}</span>)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="All students"
        action={
          <div className="flex items-center gap-2">
            <input className={`${dInput} w-56`} placeholder="Search name, email, program…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={dInput} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All stages</option>
              {stages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Student</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Program</th>
                <th className="px-3 py-2">Semester</th><th className="px-3 py-2 text-right">Invoiced</th>
                <th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2">Moodle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                  <td className="px-3 py-2.5">
                    <a href={`/applicants/${r.id}`} className="font-medium text-slate-100 hover:text-purple-300">{r.name || '—'}</a>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stagePill(r.stage)}`}>{STAGE_LABEL[r.stage] ?? r.stage}</span></td>
                  <td className="px-3 py-2.5 text-slate-300">{r.program ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-2.5">
                    {r.currentTerm ? (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        {r.currentTerm}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${r.currentTermStatus === 'enrolled' ? 'bg-emerald-500/15 text-emerald-300' : r.currentTermStatus === 'paid' ? 'bg-sky-500/15 text-sky-300' : r.currentTermStatus === 'invoiced' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>{r.currentTermStatus}</span>
                        {r.termsTotal > 0 && <span className="text-xs text-slate-500">{r.termsEnrolled}/{r.termsTotal}</span>}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{r.invoiced}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{r.paid}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${+r.outstanding > 0 ? 'font-medium text-rose-300' : 'text-slate-500'}`}>{r.outstanding}</td>
                  <td className="px-3 py-2.5">{r.moodleUserId ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">#{r.moodleUserId}</span> : <span className="text-xs text-slate-600">—</span>}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No students match.</td></tr>}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-slate-700 text-sm font-medium">
                <tr>
                  <td className="px-3 py-2 text-slate-400" colSpan={4}>Totals ({filtered[0].currency})</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{totals.invoiced.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{totals.paid.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${totals.outstanding > 0 ? 'text-rose-300' : 'text-slate-500'}`}>{totals.outstanding.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </Shell>
  );
}

function Mini({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
