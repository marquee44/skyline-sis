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
        <button onClick={logout} className="text-sm text-slate-500 hover:underline">
          Sign out
        </button>
      </header>
      {error && <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <Universities unis={unis} onChange={reload} setError={setError} />
      <Programs programs={programs} unis={unis} onChange={reload} setError={setError} />
      <Courses courses={courses} programs={programs} onChange={reload} setError={setError} />
    </main>
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
          <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
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
