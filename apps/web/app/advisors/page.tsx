'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  getToken,
  setToken,
  type Advisor,
  type Applicant,
  type Slot,
  type Consultation,
} from '@/lib/api';
import { Shell, Card, dInput, dBtn, dBtnGhost } from '@/components/Shell';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const inputCls = dInput;
const btnCls = dBtn;

export default function AdvisorsPage() {
  const router = useRouter();
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setAdvisors(await api.get<Advisor[]>('/advisors'));
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

  if (loading) return <Shell title="Advisors"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Advisors & booking" subtitle={`${advisors.length} advisors`}>
      <div className="max-w-5xl space-y-8">
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <CreateAdvisor onChange={reload} setError={setError} />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-200">Advisors ({advisors.length})</h2>
        {advisors.map((a) => (
          <AdvisorCard key={a.id} advisor={a} onChange={reload} setError={setError} />
        ))}
        {advisors.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
      </section>

      <BookingPanel advisors={advisors} setError={setError} />
    </div>
    </Shell>
  );
}

function CreateAdvisor({ onChange, setError }: { onChange: () => void; setError: (e: string | null) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post('/advisors', { name, email });
          setName(''); setEmail(''); setError(null); onChange();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Create failed');
        }
      }}
    >
      <input className={inputCls} placeholder="Advisor name" required value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className={btnCls} type="submit">Add advisor</button>
    </form>
  );
}

function AdvisorCard({ advisor, onChange, setError }: { advisor: Advisor; onChange: () => void; setError: (e: string | null) => void }) {
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [timezone, setTimezone] = useState('Asia/Dubai');

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {advisor.name} <span className="text-sm text-slate-400">· {advisor.email}{advisor.active ? '' : ' · inactive'}</span>
        </span>
        <button
          className="text-xs text-rose-300 hover:underline"
          onClick={async () => {
            try { await api.del(`/advisors/${advisor.id}`); onChange(); }
            catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
          }}
        >delete</button>
      </div>
      <ul className="mb-2 space-y-1 text-sm">
        {advisor.availabilityRules.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span className="text-slate-300">
              {WEEKDAYS[r.weekday]} {r.startTime}–{r.endTime} · {r.slotMinutes}min · {r.timezone}
            </span>
            <button
              className="text-xs text-rose-300 hover:underline"
              onClick={async () => {
                try { await api.del(`/advisors/${advisor.id}/availability/${r.id}`); onChange(); }
                catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
              }}
            >remove</button>
          </li>
        ))}
        {advisor.availabilityRules.length === 0 && <li className="text-slate-400">No availability rules.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post(`/advisors/${advisor.id}/availability`, { weekday, startTime, endTime, slotMinutes, timezone });
            setError(null); onChange();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Add rule failed');
          }
        }}
      >
        <select className={inputCls} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
          {WEEKDAYS.map((d, i) => (<option key={d} value={i}>{d}</option>))}
        </select>
        <input className={`${inputCls} w-24`} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <input className={`${inputCls} w-24`} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <input className={`${inputCls} w-20`} type="number" min="5" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} />
        <input className={`${inputCls} w-36`} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        <button className={btnCls} type="submit">Add rule</button>
      </form>
    </div>
  );
}

function BookingPanel({ advisors, setError }: { advisors: Advisor[]; setError: (e: string | null) => void }) {
  const [advisorId, setAdvisorId] = useState('');
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantId, setApplicantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const tz = 'Asia/Dubai';

  useEffect(() => {
    api.get<Applicant[]>('/applicants').then(setApplicants).catch(() => {});
  }, []);

  const loadConsultations = useCallback(async (adv: string) => {
    if (!adv) return;
    try { setConsultations(await api.get<Consultation[]>(`/consultations?advisorId=${adv}`)); }
    catch { /* ignore */ }
  }, []);

  async function fetchSlots() {
    if (!advisorId || !from || !to) return;
    try {
      setSlots(await api.get<Slot[]>(`/advisors/${advisorId}/slots?from=${from}&to=${to}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Slots failed');
    }
  }

  async function book(startUtc: string) {
    if (!applicantId) { setError('Pick an applicant first'); return; }
    try {
      await api.post('/consultations', { applicantId, advisorId, scheduledStartUtc: startUtc, studentTimezone: tz });
      setError(null);
      await fetchSlots();
      await loadConsultations(advisorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    }
  }

  function fmt(utc: string) {
    return new Date(utc).toLocaleString('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-lg font-semibold">Book a consultation</h2>
      <div className="flex flex-wrap items-end gap-2">
        <select className={inputCls} value={advisorId} onChange={(e) => { setAdvisorId(e.target.value); setSlots(null); loadConsultations(e.target.value); }}>
          <option value="">Advisor…</option>
          {advisors.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
        </select>
        <select className={inputCls} value={applicantId} onChange={(e) => setApplicantId(e.target.value)}>
          <option value="">Applicant…</option>
          {applicants.map((a) => (<option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>))}
        </select>
        <input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className={btnCls} onClick={fetchSlots} type="button">Find slots</button>
        <span className="text-xs text-slate-400">times shown in {tz}</span>
      </div>

      {slots && (
        <div className="flex flex-wrap gap-2">
          {slots.length === 0 && <p className="text-sm text-slate-400">No slots in range.</p>}
          {slots.map((s) => (
            <button key={s.startUtc} onClick={() => book(s.startUtc)} className="rounded-md border border-sky-300 px-2 py-1 text-xs hover:bg-sky-50 dark:border-sky-800 dark:hover:bg-sky-950">
              {fmt(s.startUtc)}
            </button>
          ))}
        </div>
      )}

      {consultations.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-500">Booked</h3>
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {consultations.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span>
                  {fmt(c.scheduledStartUtc)} · {c.applicant?.firstName} {c.applicant?.lastName}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${c.status === 'cancelled' ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{c.status}</span>
                </span>
                {c.status === 'booked' && (
                  <button
                    className="text-xs text-rose-300 hover:underline"
                    onClick={async () => {
                      try { await api.post(`/consultations/${c.id}/cancel`, {}); await loadConsultations(advisorId); await fetchSlots(); }
                      catch (err) { setError(err instanceof Error ? err.message : 'Cancel failed'); }
                    }}
                  >cancel</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
