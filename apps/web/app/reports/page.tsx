'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type FinanceReport, type FinanceReportRow } from '@/lib/api';
import { Shell, Card } from '@/components/Shell';

function toCsv(rows: FinanceReportRow[], header: string): string {
  const lines = [[header, 'Invoiced', 'Paid', 'Outstanding'].join(',')];
  for (const r of rows) {
    lines.push([`"${r.name.replace(/"/g, '""')}"`, r.invoiced, r.paid, r.outstanding].join(','));
  }
  return lines.join('\n');
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const router = useRouter();
  const [r, setR] = useState<FinanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<FinanceReport>('/reports/finance')
      .then(setR)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
        setError(err instanceof Error ? err.message : 'Failed to load');
      });
  }, [router]);

  if (error) return <Shell title="Finance reports"><p className="text-rose-300">{error}</p></Shell>;
  if (!r) return <Shell title="Finance reports"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Finance reports" subtitle="Revenue, balances, exports">
      <div className="space-y-6">
        {/* Totals */}
        <section className="grid grid-cols-3 gap-4">
          <Stat label="Invoiced" value={`${r.totals.invoiced} ${r.currency}`} />
          <Stat label="Paid" value={`${r.totals.paid} ${r.currency}`} color="text-emerald-300" />
          <Stat label="Outstanding" value={`${r.totals.outstanding} ${r.currency}`} color={Number(r.totals.outstanding) > 0 ? 'text-rose-300' : 'text-slate-300'} />
        </section>

        <ReportTable title="Revenue by program" col="Program" rows={r.byProgram} csv="revenue-by-program.csv" />
        <ReportTable title="Revenue by semester" col="Semester" rows={r.byTerm} csv="revenue-by-semester.csv" />
        <ReportTable title="Outstanding balances (who owes)" col="Student" rows={r.outstanding} csv="outstanding-balances.csv" emptyNote="Nobody has an outstanding balance. 🎉" />
      </div>
    </Shell>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function ReportTable({ title, col, rows, csv, emptyNote }: { title: string; col: string; rows: FinanceReportRow[]; csv: string; emptyNote?: string }) {
  return (
    <Card title={title} action={rows.length > 0 ? <button onClick={() => download(csv, toCsv(rows, col))} className="text-xs text-purple-400 hover:underline">Export CSV</button> : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{col}</th>
              <th className="px-3 py-2 text-right">Invoiced</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-200">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{row.invoiced}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{row.paid}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${Number(row.outstanding) > 0 ? 'font-medium text-rose-300' : 'text-slate-500'}`}>{row.outstanding}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">{emptyNote ?? 'No data.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
