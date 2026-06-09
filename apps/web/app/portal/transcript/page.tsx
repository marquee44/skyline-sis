'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type Transcript } from '@/lib/api';

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
      </header>

      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2">Course</th>
            <th className="py-2 text-right">Grade</th>
            <th className="py-2 text-right">%</th>
            <th className="py-2 text-right">Completed</th>
          </tr>
        </thead>
        <tbody>
          {t.courses.map((c, i) => (
            <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-2">{c.course}</td>
              <td className="py-2 text-right tabular-nums">{c.grade ?? '—'}</td>
              <td className="py-2 text-right tabular-nums">{c.percentage ?? '—'}</td>
              <td className="py-2 text-right">{c.completed == null ? '—' : c.completed ? '✓' : '–'}</td>
            </tr>
          ))}
          {t.courses.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-slate-400">No courses yet.</td></tr>
          )}
        </tbody>
      </table>

      <p className="text-xs text-slate-400">
        Grades and completion are read live from Moodle. Dashes mean a course has no grade recorded yet.
      </p>
    </main>
  );
}
