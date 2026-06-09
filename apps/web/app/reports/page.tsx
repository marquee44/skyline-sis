'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type FinanceReport, type FinanceReportRow } from '@/lib/api';

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

  if (error) return <main className="mx-auto max-w-5xl px-6 py-10"><p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p></main>;
  if (!r) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Finance reports</h1>
        <nav className="flex gap-4 text-sm text-slate-500">
          <a href="/pipeline" className="hover:underline">Pipeline</a>
          <a href="/students" className="hover:underline">Students</a>
          <a href="/catalog" className="hover:underline">Catalog</a>
          <a href="/account" className="hover:underline">Account</a>
        </nav>
      </header>

      {/* Totals */}
      <section className="grid grid-cols-3 gap-4">
        <Stat label="Invoiced" value={`${r.totals.invoiced} ${r.currency}`} />
        <Stat label="Paid" value={`${r.totals.paid} ${r.currency}`} color="text-emerald-600" />
        <Stat label="Outstanding" value={`${r.totals.outstanding} ${r.currency}`} color={Number(r.totals.outstanding) > 0 ? 'text-rose-600' : 'text-slate-500'} />
      </section>

      <ReportTable title="Revenue by program" col="Program" rows={r.byProgram} csv="revenue-by-program.csv" />
      <ReportTable title="Revenue by semester" col="Semester" rows={r.byTerm} csv="revenue-by-semester.csv" />
      <ReportTable title="Outstanding balances (who owes)" col="Student" rows={r.outstanding} csv="outstanding-balances.csv" emptyNote="Nobody has an outstanding balance. 🎉" />
    </main>
  );
}

function Stat({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function ReportTable({ title, col, rows, csv, emptyNote }: { title: string; col: string; rows: FinanceReportRow[]; csv: string; emptyNote?: string }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {rows.length > 0 && (
          <button onClick={() => download(csv, toCsv(rows, col))} className="text-xs text-sky-600 hover:underline">Export CSV</button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2">{col}</th>
              <th className="px-3 py-2 text-right">Invoiced</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.invoiced}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{row.paid}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${Number(row.outstanding) > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{row.outstanding}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">{emptyNote ?? 'No data.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
