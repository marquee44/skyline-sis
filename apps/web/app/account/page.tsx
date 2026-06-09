'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type AuthUser } from '@/lib/api';

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    api.get<AuthUser>('/auth/me')
      .then(setMe)
      .catch((err) => { if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); } });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) { setMsg({ kind: 'err', text: 'New passwords do not match' }); return; }
    if (next.length < 8) { setMsg({ kind: 'err', text: 'New password must be at least 8 characters' }); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setMsg({ kind: 'ok', text: 'Password changed.' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to change password' });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-10">
      <header className="space-y-1">
        <a href="/pipeline" className="text-sm text-slate-500 hover:underline">← Back</a>
        <h1 className="text-2xl font-bold">Account</h1>
        {me && <p className="text-sm text-slate-500">{me.email} · {me.role}</p>}
      </header>

      <section className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-lg font-semibold">Change password</h2>
        {msg && (
          <p className={`rounded-md px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{msg.text}</p>
        )}
        <form className="space-y-3" onSubmit={submit}>
          <input className={inputCls} type="password" placeholder="Current password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <input className={inputCls} type="password" placeholder="New password (min 8)" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Confirm new password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50" disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>
    </main>
  );
}
