// Thin landing page. It calls the API health endpoint (through nginx in prod,
// through the next.config rewrite in dev) to prove the full stack is wired:
// browser → Next → /api → NestJS → Postgres.

async function getHealth(): Promise<{ status: string; db: string; time: string } | null> {
  try {
    const base = process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3001';
    const res = await fetch(`${base}/api/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();
  const ok = health?.status === 'ok';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-sky-600">
          Skyline University Admission Services
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Skyline SIS</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Admissions &amp; enrollment pipeline — intake → booking → advisory →
          program → documents → finance → Moodle.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">System status</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>API</span>
            <Badge ok={Boolean(health)} label={health ? 'reachable' : 'unreachable'} />
          </li>
          <li className="flex items-center justify-between">
            <span>Database</span>
            <Badge ok={health?.db === 'up'} label={health?.db ?? 'unknown'} />
          </li>
          <li className="flex items-center justify-between">
            <span>Overall</span>
            <Badge ok={ok} label={health?.status ?? 'down'} />
          </li>
        </ul>
      </section>

      <div>
        <a
          href="/login"
          className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Staff sign in →
        </a>
      </div>

      <footer className="text-xs text-slate-400">
        Increment 2 — catalog admin. Next: applicants &amp; the stage state
        machine.
      </footer>
    </main>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        'rounded-full px-2.5 py-0.5 text-xs font-medium ' +
        (ok
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300')
      }
    >
      {label}
    </span>
  );
}
