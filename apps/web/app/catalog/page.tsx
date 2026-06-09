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

  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Catalog admin</h1>
        <nav className="flex gap-4 text-sm text-slate-500">
          <a href="/applicants" className="hover:underline">Applicants</a>
          <a href="/advisors" className="hover:underline">Advisors</a>
          <button onClick={logout} className="hover:underline">Sign out</button>
        </nav>
      </header>
      {error && <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <MoodlePanel onChange={reload} setError={setError} />
      <Universities unis={unis} onChange={reload} setError={setError} />
      <Programs programs={programs} unis={unis} onChange={reload} setError={setError} />
      <Courses courses={courses} programs={programs} onChange={reload} setError={setError} />
    </main>
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
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700"
          disabled={busy}
          onClick={() => run(async () => setMoodleCourses(await api.get<MoodleCourse[]>('/moodle/courses')))}
        >
          Browse Moodle courses
        </button>
      </div>

      {notice && <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      {summary && (
        <p className="text-sm text-emerald-700">
          Imported {summary.universities} universities, {summary.programs} programs, {summary.terms} terms, {summary.courses} courses
          {summary.skipped.length ? ` · ${summary.skipped.length} skipped` : ''}.
        </p>
      )}
      {moodleCourses && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 text-sm dark:border-slate-800">
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

const inputCls =
  'rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';
const btnCls =
  'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50';

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
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
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
              className="text-xs text-rose-500 hover:underline"
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
        className="text-xs text-sky-600 hover:underline"
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
        className="text-sky-600 hover:underline"
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
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
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
                className="text-xs text-rose-500 hover:underline"
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

  return (
    <Section title={`Courses (${courses.length})`}>
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {courses.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              <strong>{c.name}</strong>{' '}
              <span className="text-slate-400">
                · {c.program?.name} · moodle:{c.moodleCourseId ?? '—'}
              </span>
            </span>
            <button
              onClick={() =>
                guarded(async () => {
                  await api.del(`/courses/${c.id}`);
                  onChange();
                }, setError)
              }
              className="text-xs text-rose-500 hover:underline"
            >
              delete
            </button>
          </li>
        ))}
        {courses.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">None yet.</li>}
      </ul>
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
