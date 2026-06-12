'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Slot = { startUtc: string; endUtc: string };
type BookConfig = { available: boolean; programs: { id: string; name: string; level: string }[]; turnstileSiteKey: string | null };

declare global {
  interface Window { onTurnstile?: (token: string) => void }
}

export default function BookPage() {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [config, setConfig] = useState<BookConfig | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selSlot, setSelSlot] = useState<string | null>(null);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', countryOfOrigin: '', programInterest: '' });
  const [token, setTokenVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string; zoomJoinUrl: string | null } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get<BookConfig>('/public/booking/config').then(setConfig).catch(() => setError('Could not load booking. Please try again later.'));
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    api.get<Slot[]>(`/public/booking/slots?from=${from}&to=${to}`).then(setSlots).catch(() => {});
  }, []);

  // Load Cloudflare Turnstile only if a site key is configured.
  useEffect(() => {
    if (!config?.turnstileSiteKey) return;
    window.onTurnstile = (t: string) => setTokenVal(t);
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true; s.defer = true;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [config?.turnstileSiteKey]);

  // Group slots by local day.
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = new Date(s.startUtc).toLocaleDateString('en-CA', { timeZone: tz });
      (m.get(key) ?? m.set(key, []).get(key)!).push(s);
    }
    return m;
  }, [slots, tz]);
  const days = useMemo(() => Array.from(byDay.keys()).sort(), [byDay]);
  useEffect(() => { if (!selDay && days.length) setSelDay(days[0]); }, [days, selDay]);

  const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = (utc: string) => new Date(utc).toLocaleTimeString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selSlot) { setError('Please pick a time.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ when: string; zoomJoinUrl: string | null }>('/public/booking', {
        ...f, scheduledStartUtc: selSlot, studentTimezone: tz, turnstileToken: token,
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10 text-slate-800">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-lg font-bold text-white">S</div>
          <h1 className="text-2xl font-bold">Book your free consultation</h1>
          <p className="text-sm text-slate-500">Skyline University Admission Services · times shown in {tz}</p>
        </header>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl">✓</div>
            <h2 className="text-xl font-bold">You're booked!</h2>
            <p className="mt-1 text-slate-600">{done.when} ({tz})</p>
            <p className="mt-3 text-sm text-slate-500">We've emailed you a confirmation. An advisor will meet you here:</p>
            {done.zoomJoinUrl && <a href={done.zoomJoinUrl} className="mt-2 inline-block rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500">Join link</a>}
          </div>
        ) : config && !config.available ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">Online booking isn't available right now. Please check back soon.</div>
        ) : (
          <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
            {/* Calendar */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">1 · Pick a time</h2>
              {days.length === 0 ? (
                <p className="text-sm text-slate-400">Loading available times…</p>
              ) : (
                <>
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {days.map((d) => (
                      <button type="button" key={d} onClick={() => { setSelDay(d); setSelSlot(null); }}
                        className={`shrink-0 rounded-lg border px-3 py-2 text-xs ${selDay === d ? 'border-purple-500 bg-purple-50 font-medium text-purple-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                        {fmtDay(d)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(selDay ? byDay.get(selDay) ?? [] : []).map((s) => (
                      <button type="button" key={s.startUtc} onClick={() => setSelSlot(s.startUtc)}
                        className={`rounded-lg border px-2 py-2 text-sm ${selSlot === s.startUtc ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50'}`}>
                        {fmtTime(s.startUtc)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Details */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">2 · Your details</h2>
              <div className="grid grid-cols-2 gap-3">
                <input className={inp} placeholder="First name" required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
                <input className={inp} placeholder="Last name" required value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
                <input className={`${inp} col-span-2`} type="email" placeholder="Email" required value={f.email} onChange={(e) => set('email', e.target.value)} />
                <input className={inp} placeholder="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
                <input className={inp} placeholder="Country" value={f.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} />
                <select className={`${inp} col-span-2`} value={f.programInterest} onChange={(e) => set('programInterest', e.target.value)}>
                  <option value="">Program of interest (optional)</option>
                  {config?.programs.map((p) => <option key={p.id} value={p.name}>{p.name} ({p.level})</option>)}
                </select>
              </div>
              {config?.turnstileSiteKey && <div className="cf-turnstile mt-3" data-sitekey={config.turnstileSiteKey} data-callback="onTurnstile" />}
              {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {selSlot ? `Selected: ${fmtDay(selDay!)} at ${fmtTime(selSlot)}` : 'No time selected yet'}
              </div>
              <button type="submit" disabled={busy || !selSlot} className="mt-3 w-full rounded-lg bg-purple-600 px-4 py-2.5 font-medium text-white hover:bg-purple-500 disabled:opacity-50">
                {busy ? 'Booking…' : 'Confirm booking'}
              </button>
            </section>
          </form>
        )}
      </div>
    </main>
  );
}

const inp = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none';
