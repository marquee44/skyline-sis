'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type Transcript, type TranscriptCourse } from '@/lib/api';

export default function TranscriptPage() {
  const router = useRouter();
  const [t, setT] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<Transcript>('/me/transcript')
      .then(setT)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
        setError(err instanceof Error ? err.message : 'Failed to load');
      });
  }, [router]);

  if (error) return <main className="mx-auto max-w-2xl px-6 py-10"><a href="/portal" className="text-sm text-slate-500 hover:underline">← Back</a><p className="mt-4 rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p></main>;
  if (!t) return <p className="p-8 text-slate-500">Loading…</p>;

  // Group by semester (term), ordered by sequence.
  const groups = new Map<string, { name: string; seq: number; items: TranscriptCourse[] }>();
  for (const c of t.courses) {
    const key = c.term?.name ?? '(no semester)';
    if (!groups.has(key)) groups.set(key, { name: key, seq: c.term?.sequence ?? 999, items: [] });
    groups.get(key)!.items.push(c);
  }
  const terms = Array.from(groups.values()).sort((a, b) => a.seq - b.seq);
  const totalEnrolled = t.courses.filter((c) => c.enrolled).length;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between print:hidden">
        <a href="/portal" className="text-sm text-slate-500 hover:underline">← Back to portal</a>
        <button onClick={() => window.print()} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">Print / Save PDF</button>
      </div>

      <header className="space-y-1 border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Transcript</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.student.name} · {t.student.email}</p>
        <p className="text-sm text-slate-500">
          {t.program ? `${t.program.name} (${t.program.level})` : '—'}{t.university ? ` · ${t.university.name}` : ''}
        </p>
        <p className="text-xs text-slate-400">Enrolled in {totalEnrolled} of {t.courses.length} courses · grades read live from Moodle.</p>
      </header>

      {terms.map((term) => {
        const enr = term.items.filter((c) => c.enrolled).length;
        return (
          <section key={term.name} className="space-y-2">
            <h2 className="flex items-baseline justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>{term.name}</span>
              <span className="text-xs font-normal text-slate-400">{enr > 0 ? `${enr} enrolled · ` : ''}{term.items.length} courses</span>
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-1">Course</th>
                  <th className="py-1 text-right">Grade</th>
                  <th className="py-1 text-right">%</th>
                  <th className="py-1 text-right">Completed</th>
                </tr>
              </thead>
              <tbody>
                {term.items.map((c, i) => (
                  <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 ${c.enrolled ? '' : 'text-slate-400'}`}>
                    <td className="py-1.5">
                      {c.course}
                      {c.enrolled && <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 print:hidden">enrolled</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{c.grade ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.percentage ?? '—'}</td>
                    <td className="py-1.5 text-right">{c.completed == null ? '—' : c.completed ? '✓' : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {t.courses.length === 0 && <p className="py-6 text-center text-slate-400">No courses yet.</p>}
    </main>
  );
}
