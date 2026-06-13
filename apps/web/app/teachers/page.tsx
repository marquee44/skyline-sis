'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type TeacherRow } from '@/lib/api';
import { Shell, Card, dBtn, dInput } from '@/components/Shell';

export default function TeachersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await api.get<TeacherRow[]>('/teachers'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (!getToken()) { router.push('/login'); return; } reload(); }, [reload, router]);

  async function importNow() {
    setBusy(true); setNote(null); setError(null);
    try {
      const r = await api.post<{ teachers: number; links: number; coursesScanned: number; errors: number }>('/teachers/import', {});
      setNote(`Imported ${r.teachers} teacher(s) across ${r.links} course assignment(s) from ${r.coursesScanned} courses${r.errors ? ` · ${r.errors} course(s) failed (Moodle may need the core_enrol_get_enrolled_users web-service function)` : ''}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally { setBusy(false); }
  }

  const filtered = rows.filter((t) =>
    !q || `${t.name} ${t.email ?? ''} ${t.courses.map((c) => c.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()),
  );

  if (loading) return <Shell title="Teachers"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Teachers" subtitle={`${rows.length} from Moodle`} actions={<button className={dBtn} disabled={busy} onClick={importNow}>{busy ? 'Importing…' : 'Import from Moodle'}</button>}>
      <div className="max-w-3xl space-y-4">
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        {note && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{note}</p>}

        <Card
          title="Faculty"
          action={<input className={`${dInput} w-56`} placeholder="Search name, email, course…" value={q} onChange={(e) => setQ(e.target.value)} />}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">No teachers yet. Click <strong>Import from Moodle</strong> to pull instructors from your courses.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((t) => {
                const isOpen = open === t.id;
                return (
                  <li key={t.id} className="rounded-lg border border-slate-800 bg-slate-900/40">
                    <button onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span>
                        <span className="font-medium text-slate-100">{isOpen ? '▾' : '▸'} {t.name}</span>
                        {t.email && <span className="ml-2 text-xs text-slate-500">{t.email}</span>}
                      </span>
                      <span className="text-xs text-slate-500">{t.courseCount} course{t.courseCount === 1 ? '' : 's'}</span>
                    </button>
                    {isOpen && (
                      <ul className="space-y-1 border-t border-slate-800 px-3 py-2 text-sm">
                        {t.courses.map((c, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-200">{c.name}</span>
                            {c.program && <span className="text-xs text-slate-500">· {c.program}{c.level ? ` (${c.level})` : ''}</span>}
                            {c.role && <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{c.role}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="text-sm text-slate-400">No teachers match.</li>}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
