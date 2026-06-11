'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type DashboardData } from '@/lib/api';
import { Shell } from '@/components/Shell';

const fmt = (n: string | number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const COLORS = ['#a855f7', '#6366f1', '#ec4899', '#22d3ee', '#f59e0b', '#10b981', '#64748b'];

export default function DashboardPage() {
  const router = useRouter();
  const [d, setD] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<DashboardData>('/dashboard')
      .then(setD)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
        setError(err instanceof Error ? err.message : 'Failed to load');
      });
  }, [router]);

  if (error) return <Shell title="Dashboard"><p className="text-rose-300">{error}</p></Shell>;
  if (!d) return <Shell title="Dashboard"><p className="text-slate-400">Loading…</p></Shell>;

  const cur = d.kpis.currency;
  const maxFunnel = Math.max(1, ...d.funnel.map((f) => f.count));

  return (
    <Shell title="Dashboard" subtitle="Your command center">
      <div className="space-y-6">
        {/* KPI cards */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Active students" value={fmt(d.kpis.activeStudents)} />
          <Kpi label="In pipeline" value={fmt(d.kpis.pipeline)} />
          <Kpi label="New this month" value={fmt(d.kpis.newApplicantsThisMonth)} trend={d.kpis.newApplicantsTrendPct} />
          <Kpi label="Collected (mo)" value={`${fmt(d.kpis.collectedThisMonth)}`} sub={cur} trend={d.kpis.collectedTrendPct} />
          <Kpi label="Outstanding" value={`${fmt(d.kpis.outstanding)}`} sub={cur} danger={Number(d.kpis.outstanding) > 0} />
          <Kpi label="Conversion" value={`${d.kpis.conversionPct}%`} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Money */}
            <Card title="Money">
              <div className="grid grid-cols-3 gap-4">
                <Money label="Collected" value={d.money.collected} cur={cur} accent="text-emerald-400" />
                <Money label="Outstanding" value={d.money.outstanding} cur={cur} accent={Number(d.money.outstanding) > 0 ? 'text-rose-400' : 'text-slate-300'} />
                <Money label="Invoiced" value={d.money.invoiced} cur={cur} accent="text-slate-200" />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Forwarded to universities:{' '}
                {d.money.forwarded.length === 0 ? <span className="text-slate-500">none yet</span> :
                  d.money.forwarded.map((f) => `${fmt(f.amount)} ${f.currency}`).join(' · ')}
                {' '}— your margin is collected minus forwarded.
              </p>
            </Card>

            {/* Funnel + Donut side by side */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card title="Pipeline funnel">
                <ul className="space-y-2">
                  {d.funnel.map((f) => (
                    <li key={f.stage} className="text-sm">
                      <div className="mb-1 flex justify-between text-slate-300"><span>{f.label}</span><span className="tabular-nums text-slate-400">{f.count}</span></div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-purple-500" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="Revenue by program">
                <Donut segments={d.byProgram.map((p, i) => ({ label: p.name, value: Number(p.paid), color: COLORS[i % COLORS.length] }))} cur={cur} />
              </Card>
            </div>

            {/* Recent payments */}
            <Card title="Recent payments">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr><th className="py-1">Student</th><th className="py-1">Method</th><th className="py-1 text-right">Amount</th><th className="py-1 text-right">When</th></tr>
                </thead>
                <tbody>
                  {d.recentPayments.map((p, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="py-1.5">{p.name}</td>
                      <td className="py-1.5 text-slate-400">{p.method}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-400">{fmt(p.amount)} {p.currency}</td>
                      <td className="py-1.5 text-right text-slate-500">{new Date(p.whenUtc).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {d.recentPayments.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-slate-500">No payments yet.</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Needs attention */}
            <Card title={`⚠️ Needs attention (${d.atRisk.count})`} amber>
              <ul className="space-y-2 text-sm">
                {d.atRisk.items.map((a) => (
                  <li key={a.id}>
                    <a href={`/applicants/${a.id}`} className="font-medium text-amber-200 hover:underline">{a.name}</a>
                    <div className="text-xs text-amber-300/70">{a.reasons.join(' · ')}</div>
                  </li>
                ))}
                {d.atRisk.count === 0 && <li className="text-slate-500">All clear 🎉</li>}
              </ul>
            </Card>

            {/* Renewal forecast */}
            <Card title="Next-semester renewals">
              <p className="text-sm text-slate-300">
                <span className="text-2xl font-bold text-white">{fmt(d.renewals.expectedAmount)}</span> {d.renewals.currency}
                <span className="text-slate-400"> expected from {d.renewals.studentCount} student{d.renewals.studentCount === 1 ? '' : 's'}</span>
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {d.renewals.items.map((r, i) => (
                  <li key={i} className="flex justify-between"><span className="text-slate-300">{r.name} · {r.term}</span><span className="tabular-nums text-slate-400">{fmt(r.amount)}</span></li>
                ))}
                {d.renewals.studentCount === 0 && <li className="text-slate-500">No upcoming renewals.</li>}
              </ul>
            </Card>

            {/* Upcoming consultations */}
            <Card title="Upcoming consultations (7d)">
              <ul className="space-y-2 text-sm">
                {d.upcoming.map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-slate-300">{c.name}</span>
                    <span className="text-xs text-slate-500">{new Date(c.whenUtc).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {c.advisor}</span>
                  </li>
                ))}
                {d.upcoming.length === 0 && <li className="text-slate-500">None scheduled.</li>}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, sub, trend, danger }: { label: string; value: string; sub?: string; trend?: number | null; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${danger ? 'text-rose-400' : 'text-white'}`}>
        {value}{sub && <span className="ml-1 text-sm font-normal text-slate-500">{sub}</span>}
      </div>
      {trend != null && (
        <div className={`mt-1 text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last month</div>
      )}
    </div>
  );
}

function Card({ title, children, amber }: { title: string; children: React.ReactNode; amber?: boolean }) {
  return (
    <section className={`rounded-xl border p-4 ${amber ? 'border-amber-700/50 bg-amber-950/30' : 'border-slate-800 bg-slate-900/60'}`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

function Money({ label, value, cur, accent }: { label: string; value: string; cur: string; accent: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent}`}>{fmt(value)} <span className="text-xs font-normal text-slate-500">{cur}</span></div>
    </div>
  );
}

function Donut({ segments, cur }: { segments: { label: string; value: number; color: string }[]; cur: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-32 w-32 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="16" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </svg>
      <ul className="space-y-1 text-xs">
        {segments.slice(0, 5).map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-slate-300">{s.label.length > 16 ? s.label.slice(0, 15) + '…' : s.label}</span>
            <span className="ml-auto tabular-nums text-slate-500">{fmt(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
