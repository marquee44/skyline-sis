'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  getToken,
  setToken,
  type Applicant,
  type ApplicantStage,
  type StageTransition,
} from '@/lib/api';
import { Shell, Card, dInput } from '@/components/Shell';

const STAGE_LABEL: Record<ApplicantStage, string> = {
  intake_started: 'Intake started',
  consultation_booked: 'Consultation booked',
  consultation_completed: 'Consultation completed',
  program_proposed: 'Program proposed',
  program_approved: 'Program approved',
  program_confirmed: 'Program confirmed',
  documents_pending: 'Documents pending',
  documents_verified: 'Documents verified',
  invoice_issued: 'Invoice issued',
  payment_received: 'Payment received',
  enrolled: 'Enrolled',
  active_student: 'Active student',
  graduated: 'Graduated',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
};

function stageColor(s: ApplicantStage): string {
  if (s === 'graduated' || s === 'active_student' || s === 'enrolled')
    return 'bg-emerald-500/15 text-emerald-300';
  if (s === 'withdrawn' || s === 'rejected') return 'bg-rose-500/15 text-rose-300';
  return 'bg-sky-500/15 text-sky-300';
}

export default function ApplicantsPage() {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setApplicants(await api.get<Applicant[]>('/applicants'));
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

  async function doTransition(id: string, toStage: ApplicantStage) {
    try {
      await api.post(`/applicants/${id}/transition`, { toStage });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed');
    }
  }

  if (loading) return <Shell title="Applicants"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Applicants" subtitle={`${applicants.length} total`}>
      <div className="space-y-6">
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        <CreateApplicant onChange={reload} setError={setError} />

        <Card title="All applicants">
          <ul className="divide-y divide-slate-800">
            {applicants.map((a) => (
              <li key={a.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="font-medium text-slate-100 hover:text-purple-300">
                      {a.firstName} {a.lastName}
                    </button>
                    <span className="ml-2 text-sm text-slate-500">{a.email}</span>
                    <a href={`/applicants/${a.id}`} className="ml-2 text-xs text-purple-400 hover:underline">open →</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stageColor(a.stage)}`}>{STAGE_LABEL[a.stage]}</span>
                    {a.allowedNextStages.length > 0 && (
                      <select className={`${dInput} py-1 text-xs`} value="" onChange={(e) => { if (e.target.value) doTransition(a.id, e.target.value as ApplicantStage); }}>
                        <option value="">Move to…</option>
                        {a.allowedNextStages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                {expanded === a.id && <History applicantId={a.id} />}
              </li>
            ))}
            {applicants.length === 0 && <li className="py-3 text-sm text-slate-500">No applicants yet.</li>}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

function History({ applicantId }: { applicantId: string }) {
  const [items, setItems] = useState<StageTransition[] | null>(null);
  useEffect(() => {
    api.get<StageTransition[]>(`/applicants/${applicantId}/history`).then(setItems).catch(() => setItems([]));
  }, [applicantId]);
  if (!items) return <p className="mt-2 text-xs text-slate-400">Loading history…</p>;
  return (
    <ol className="mt-3 space-y-1 border-l-2 border-slate-700 pl-3 text-xs text-slate-400">
      {items.map((t) => (
        <li key={t.id}>
          <span className="font-medium">{t.fromStage ?? '—'} → {t.toStage}</span>
          {t.note ? ` · ${t.note}` : ''}{' '}
          <span className="text-slate-400">{new Date(t.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

function CreateApplicant({
  onChange,
  setError,
}: {
  onChange: () => void;
  setError: (e: string | null) => void;
}) {
  const empty = {
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '',
    countryOfOrigin: '', residenceCity: '', priorEducation: '', interests: '',
    sponsorName: '', sponsorContact: '',
  };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const inputCls = dInput;
  const lbl = (label: string, node: React.ReactNode) => (
    <label className="block space-y-1"><span className="text-xs text-slate-400">{label}</span>{node}</label>
  );

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const payload: Record<string, string> = {};
          for (const [k, v] of Object.entries(f)) if (v.trim()) payload[k] = v.trim();
          await api.post('/applicants', payload);
          setF(empty); setOpen(false); setError(null); onChange();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Create failed');
        }
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {lbl('First name', <input className={`${inputCls} w-full`} required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />)}
        {lbl('Last name', <input className={`${inputCls} w-full`} required value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />)}
        {lbl('Email', <input className={`${inputCls} w-full`} type="email" required value={f.email} onChange={(e) => set('email', e.target.value)} />)}
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-2 border-t border-slate-800 pt-3 sm:grid-cols-3">
          {lbl('Phone', <input className={`${inputCls} w-full`} value={f.phone} onChange={(e) => set('phone', e.target.value)} />)}
          {lbl('Date of birth', <input className={`${inputCls} w-full`} type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />)}
          {lbl('Gender', <select className={`${inputCls} w-full`} value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select>)}
          {lbl('Country of origin', <input className={`${inputCls} w-full`} value={f.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} />)}
          {lbl('Residence city', <input className={`${inputCls} w-full`} value={f.residenceCity} onChange={(e) => set('residenceCity', e.target.value)} />)}
          {lbl('Prior education', <input className={`${inputCls} w-full`} value={f.priorEducation} onChange={(e) => set('priorEducation', e.target.value)} />)}
          {lbl('Interests', <input className={`${inputCls} w-full`} value={f.interests} onChange={(e) => set('interests', e.target.value)} />)}
          {lbl('Sponsor name', <input className={`${inputCls} w-full`} value={f.sponsorName} onChange={(e) => set('sponsorName', e.target.value)} />)}
          {lbl('Sponsor contact', <input className={`${inputCls} w-full`} value={f.sponsorContact} onChange={(e) => set('sponsorContact', e.target.value)} />)}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500" type="submit">
          Add applicant
        </button>
        <button type="button" className="text-xs text-sky-600 hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? 'fewer fields' : '+ more details'}
        </button>
      </div>
    </form>
  );
}
