'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type AuthUser } from '@/lib/api';
import { Shell, Card, dInput, dBtn } from '@/components/Shell';

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

  const inputCls = `w-full ${dInput}`;

  return (
    <Shell title="Account" subtitle={me ? `${me.email} · ${me.role}` : undefined}>
      <div className="max-w-md">
        <Card title="Change password">
          {msg && (
            <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</p>
          )}
          <form className="space-y-3" onSubmit={submit}>
            <input className={inputCls} type="password" placeholder="Current password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            <input className={inputCls} type="password" placeholder="New password (min 8)" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
            <input className={inputCls} type="password" placeholder="Confirm new password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className={dBtn} disabled={busy} type="submit">{busy ? 'Saving…' : 'Change password'}</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
