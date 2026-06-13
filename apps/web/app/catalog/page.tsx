'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  getToken,
  setToken,
  type University,
  type Program,
  type Course,
  type ProgramLevel,
  type MoodleCourse,
  type ImportSummary,
  type CatalogTerm,
} from '@/lib/api';
import { Shell, Card, dInput, dBtn } from '@/components/Shell';

const LEVELS: ProgramLevel[] = ['BA', 'MA', 'MBA', 'PhD', 'professional'];

export default function CatalogPage() {
  const router = useRouter();
  const [unis, setUnis] = useState<University[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [u, p, c] = await Promise.all([
        api.get<University[]>('/universities'),
        api.get<Program[]>('/programs'),
        api.get<Course[]>('/courses'),
      ]);
      setUnis(u);
      setPrograms(p);
      setCourses(c);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    reload();
  }, [reload, router]);

  function logout() {
    setToken(null);
    router.push('/login');
  }

  if (loading) return <Shell title="Catalog"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Catalog" subtitle="Universities · programs · semesters · courses">
      <div className="max-w-5xl space-y-8">
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <MoodlePanel onChange={reload} setError={setError} />
        <Universities unis={unis} onChange={reload} setError={setError} />
        <Programs programs={programs} unis={unis} onChange={reload} setError={setError} />
        <Courses courses={courses} programs={programs} onChange={reload} setError={setError} />
      </div>
    </Shell>
  );
}

function MoodlePanel({ onChange, setError }: { onChange: () => void; setError: SetErr }) {
  const [moodleCourses, setMoodleCourses] = useState<MoodleCourse[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      // 503 = Moodle not configured yet
      setNotice(msg.includes('not configured') || msg.includes('503') ? 'Moodle is not configured yet — add MOODLE_BASE_URL/MOODLE_WS_TOKEN.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Moodle">
      <p className="text-sm text-slate-500">
        Pull your catalog from the central Moodle. Import maps categories → universities/programs
        and courses → courses (with Moodle IDs), so enrollment can place students automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={btnCls}
          disabled={busy}
          onClick={() => run(async () => {
            const s = await api.post<ImportSummary>('/moodle/import', {});
            setSummary(s);
            onChange();
          })}
        >
          {busy ? 'Working…' : 'Import from Moodle'}
        </button>
        <button
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 border-slate-700"
          disabled={busy}
          onClick={() => run(async () => setMoodleCourses(await api.get<MoodleCourse[]>('/moodle/courses')))}
        >
          Browse Moodle courses
        </button>
      </div>

      {notice && <p className="rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-300">{notice}</p>}
      {summary && (
        <p className="text-sm text-emerald-300">
          Imported {summary.universities} universities, {summary.programs} programs, {summary.terms} terms, {summary.courses} courses
          {summary.skipped.length ? ` · ${summary.skipped.length} skipped` : ''}.
        </p>
      )}
      {moodleCourses && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-800 p-2 text-sm">
          {moodleCourses.map((c) => (
            <li key={c.id} className="text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">#{c.id}</span> {c.fullname}{' '}
              <span className="text-slate-400">({c.shortname})</span>
            </li>
          ))}
          {moodleCourses.length === 0 && <li className="text-slate-400">No courses returned.</li>}
        </ul>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const inputCls = dInput;
const btnCls = dBtn;

type SetErr = (e: string | null) => void;

async function guarded(fn: () => Promise<void>, setError: SetErr) {
  try {
    await fn();
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Request failed');
  }
}

function Universities({
  unis,
  onChange,
  setError,
}: {
  unis: University[];
  onChange: () => void;
  setError: SetErr;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [country, setCountry] = useState('RS');

  return (
    <Section title={`Universities (${unis.length})`}>
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
        {unis.map((u) => (
          <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              <strong>{u.name}</strong>{' '}
              <span className="text-slate-400">
                {u.shortName ? `· ${u.shortName}` : ''} · {u.country} ·{' '}
                {u._count?.programs ?? 0} programs
              </span>
            </span>
            <button
              onClick={() =>
                guarded(async () => {
                  await api.del(`/universities/${u.id}`);
                  onChange();
                }, setError)
              }
              className="text-xs text-rose-300 hover:underline"
            >
              delete
            </button>
          </li>
        ))}
        {unis.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">None yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          guarded(async () => {
            await api.post('/universities', { name, shortName: shortName || undefined, country });
            setName('');
            setShortName('');
            onChange();
          }, setError);
        }}
      >
        <input className={inputCls} placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} placeholder="Short" value={shortName} onChange={(e) => setShortName(e.target.value)} />
        <input className={`${inputCls} w-16`} placeholder="RS" value={country} onChange={(e) => setCountry(e.target.value)} />
        <button className={btnCls} type="submit">Add university</button>
      </form>
    </Section>
  );
}

// Per-program semester fees editor (multi-semester billing). Lazy-loads the
// program's terms; each term's per-semester fee is editable + savable.
function TermsEditor({ programId, setError }: { programId: string; setError: SetErr }) {
  const [terms, setTerms] = useState<CatalogTerm[] | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        className="text-xs text-purple-400 hover:underline"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !terms) guarded(async () => setTerms(await api.get<CatalogTerm[]>(`/programs/${programId}/terms`)), setError);
        }}
      >
        {open ? '▾ semesters & fees' : '▸ semesters & fees'}
      </button>
      {open && terms && (
        <ul className="mt-1 space-y-1 border-l-2 border-slate-100 pl-3 dark:border-slate-800">
          {terms.map((t) => (
            <TermFeeRow key={t.id} term={t} setError={setError} />
          ))}
          {terms.length === 0 && <li className="text-xs text-slate-400">No semesters.</li>}
        </ul>
      )}
    </div>
  );
}

function TermFeeRow({ term, setError }: { term: CatalogTerm; setError: SetErr }) {
  const [fee, setFee] = useState(String(term.tuitionTotal));
  const [saved, setSaved] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-28 font-medium">{term.name}</span>
      <span className="text-slate-400">{term._count?.courses ?? 0} courses</span>
      <input
        className={`${inputCls} w-24`}
        type="number"
        min="0"
        step="0.01"
        value={fee}
        onChange={(e) => { setFee(e.target.value); setSaved(false); }}
      />
      <span className="text-slate-400">{term.tuitionCurrency}</span>
      <button
        className="text-purple-400 hover:underline"
        onClick={() => guarded(async () => { await api.patch(`/terms/${term.id}`, { tuitionTotal: Number(fee) }); setSaved(true); }, setError)}
      >
        save
      </button>
      {saved && <span className="text-emerald-600">✓</span>}
    </li>
  );
}

function Programs({
  programs,
  unis,
  onChange,
  setError,
}: {
  programs: Program[];
  unis: University[];
  onChange: () => void;
  setError: SetErr;
}) {
  const [universityId, setUniversityId] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState<ProgramLevel>('BA');
  const [tuition, setTuition] = useState('0');

  return (
    <Section title={`Programs (${programs.length})`}>
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
        {programs.map((p) => (
          <li key={p.id} className="px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>
                <strong>{p.name}</strong>{' '}
                <span className="text-slate-400">
                  · {p.level} · {p.university?.shortName ?? p.university?.name} ·{' '}
                  {p.tuitionTotal} {p.tuitionCurrency} · {p._count?.courses ?? 0} courses
                  {!p.active && ' · inactive'}
                </span>
              </span>
              <button
                onClick={() =>
                  guarded(async () => {
                    await api.del(`/programs/${p.id}`);
                    onChange();
                  }, setError)
                }
                className="text-xs text-rose-300 hover:underline"
              >
                delete
              </button>
            </div>
            <TermsEditor programId={p.id} setError={setError} />
          </li>
        ))}
        {programs.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">None yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          guarded(async () => {
            await api.post('/programs', {
              universityId,
              name,
              level,
              tuitionTotal: Number(tuition),
            });
            setName('');
            setTuition('0');
            onChange();
          }, setError);
        }}
      >
        <select className={inputCls} required value={universityId} onChange={(e) => setUniversityId(e.target.value)}>
          <option value="">University…</option>
          {unis.map((u) => (
            <option key={u.id} value={u.id}>{u.shortName ?? u.name}</option>
          ))}
        </select>
        <input className={inputCls} placeholder="Program name" required value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as ProgramLevel)}>
          {LEVELS.map((l) => (<option key={l} value={l}>{l}</option>))}
        </select>
        <input className={`${inputCls} w-28`} type="number" min="0" step="0.01" placeholder="Tuition" value={tuition} onChange={(e) => setTuition(e.target.value)} />
        <button className={btnCls} type="submit">Add program</button>
      </form>
    </Section>
  );
}

function Courses({
  courses,
  programs,
  onChange,
  setError,
}: {
  courses: Course[];
  programs: Program[];
  onChange: () => void;
  setError: SetErr;
}) {
  const [programId, setProgramId] = useState('');
  const [name, setName] = useState('');
  const [moodleCourseId, setMoodleCourseId] = useState('');
  const [openProg, setOpenProg] = useState<string | null>(null);

  // Group: program → semester (term) → courses.
  const groups = new Map<string, { name: string; terms: Map<string, { name: string; seq: number; items: Course[] }> }>();
  for (const c of courses) {
    const pid = c.program?.id ?? 'none';
    if (!groups.has(pid)) groups.set(pid, { name: c.program?.name ?? '—', terms: new Map() });
    const g = groups.get(pid)!;
    const tid = c.term?.id ?? 'none';
    if (!g.terms.has(tid)) g.terms.set(tid, { name: c.term?.name ?? '(no semester)', seq: c.term?.sequence ?? 999, items: [] });
    g.terms.get(tid)!.items.push(c);
  }
  const progList = Array.from(groups.entries())
    .map(([id, g]) => ({ id, name: g.name, terms: Array.from(g.terms.values()).sort((a, b) => a.seq - b.seq) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Section title={`Courses (${courses.length})`}>
      <div className="space-y-2">
        {progList.map((p) => {
          const total = p.terms.reduce((s, t) => s + t.items.length, 0);
          const open = openProg === p.id;
          return (
            <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/40">
              <button onClick={() => setOpenProg(open ? null : p.id)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm">
                <span className="font-medium text-slate-100">{open ? '▾' : '▸'} {p.name}</span>
                <span className="text-xs text-slate-500">{total} courses · {p.terms.length} semester{p.terms.length === 1 ? '' : 's'}</span>
              </button>
              {open && (
                <div className="space-y-3 border-t border-slate-800 px-3 py-3">
                  {p.terms.map((t) => (
                    <div key={t.name}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-300">{t.name} <span className="text-slate-600">· {t.items.length}</span></div>
                      <ul className="divide-y divide-slate-800/70 rounded-lg border border-slate-800">
                        {t.items.map((c) => (
                          <li key={c.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-slate-200">
                              {c.name} <span className="text-xs text-slate-500">· moodle:{c.moodleCourseId ?? '—'}</span>
                              {c.instructors && c.instructors.length > 0 && (
                                <span className="text-xs text-purple-300"> · 🎓 {c.instructors.map((i) => `${i.teacher.firstName} ${i.teacher.lastName}`).join(', ')}</span>
                              )}
                            </span>
                            <button onClick={() => guarded(async () => { await api.del(`/courses/${c.id}`); onChange(); }, setError)} className="text-xs text-rose-300 hover:underline">delete</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {courses.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          guarded(async () => {
            await api.post('/courses', {
              programId,
              name,
              moodleCourseId: moodleCourseId ? Number(moodleCourseId) : undefined,
            });
            setName('');
            setMoodleCourseId('');
            onChange();
          }, setError);
        }}
      >
        <select className={inputCls} required value={programId} onChange={(e) => setProgramId(e.target.value)}>
          <option value="">Program…</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input className={inputCls} placeholder="Course name" required value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${inputCls} w-32`} type="number" min="1" placeholder="Moodle id" value={moodleCourseId} onChange={(e) => setMoodleCourseId(e.target.value)} />
        <button className={btnCls} type="submit">Add course</button>
      </form>
    </Section>
  );
}
