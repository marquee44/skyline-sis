'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  getToken,
  setToken,
  type ApplicantDetail,
  type Program,
  type DocumentRec,
  type Invoice,
  type Balance,
  type AuthUser,
  type ApplicantTermRow,
  type Transcript,
} from '@/lib/api';

const DOC_TYPES = ['passport', 'emirates_id', 'prior_diploma', 'transcript', 'photo', 'legalization', 'other'];
const inputCls = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';
const btn = 'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50';
const btnAlt = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700';

export default function ApplicantDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<ApplicantDetail | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [docs, setDocs] = useState<DocumentRec[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [terms, setTerms] = useState<ApplicantTermRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [ad, progs, dl, inv, bal, who, trm] = await Promise.all([
        api.get<ApplicantDetail>(`/applicants/${id}`),
        api.get<Program[]>('/programs'),
        api.get<DocumentRec[]>(`/documents?applicantId=${id}`),
        api.get<Invoice[]>(`/invoices?applicantId=${id}`),
        api.get<Balance>(`/applicants/${id}/balance`),
        api.get<AuthUser>('/auth/me'),
        api.get<ApplicantTermRow[]>(`/applicants/${id}/terms`),
      ]);
      setA(ad); setPrograms(progs); setDocs(dl); setInvoices(inv); setBalance(bal); setMe(who); setTerms(trm);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [id, router]);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    reload();
  }, [reload, router]);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await reload(); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
  }

  if (!a) return <p className="p-8 text-slate-500">{error ?? 'Loading…'}</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="space-y-1">
        <a href="/pipeline" className="text-sm text-slate-500 hover:underline">← Pipeline</a>
        <h1 className="text-2xl font-bold">{a.firstName} {a.lastName}</h1>
        <p className="text-sm text-slate-500">{a.email} · {a.residenceCity ?? '—'} · from {a.countryOfOrigin ?? '—'}</p>
        <p className="text-sm">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{a.stage}</span>{' '}
          <span className="text-slate-400">program: {a.programChoiceStatus}</span>
        </p>
      </header>
      {error && <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Profile details (view + edit) */}
      <DetailsPanel applicant={a} onSave={(patch) => act(() => api.patch(`/applicants/${id}`, patch))} />

      {/* Academic performance (grades read from Moodle) */}
      <AcademicPanel applicantId={id} moodleUserId={a.moodleUserId ?? null} />

      {/* Consultation (admin test shortcut) */}
      {me?.role === 'admin' && (a.stage === 'intake_started' || a.stage === 'consultation_booked') && (
        <Panel title="Consultation (test)">
          <p className="text-sm text-slate-500">
            Admin-only: mark a consultation complete without an advisor/booking so you can test the
            rest of the pipeline. Advances the applicant to <code>consultation_completed</code>.
          </p>
          <button className={btn} onClick={() => act(() => api.post(`/applicants/${id}/test-consultation`, {}))}>
            Complete consultation (test)
          </button>
        </Panel>
      )}

      {/* Program selection */}
      <Panel title="Program selection">
        <p className="text-sm text-slate-500">
          Proposed: {a.proposedProgram?.name ?? '—'} · Chosen: {a.chosenProgram?.name ?? '—'}
          {a.choiceAdvisorNote ? ` · note: ${a.choiceAdvisorNote}` : ''}
        </p>
        <ProposeForm programs={programs} onPropose={(pid) => act(() => api.post(`/applicants/${id}/program/propose`, { programId: pid }))} />
        <div className="flex flex-wrap gap-2">
          <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/program/approve`, {}))}>Approve</button>
          <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/program/reject`, { note: 'reconsider' }))}>Reject</button>
          <button className={btn} onClick={() => act(() => api.post(`/applicants/${id}/program/confirm`, {}))}>Confirm</button>
        </div>
      </Panel>

      {/* Documents */}
      <Panel title="Documents">
        <ul className="space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.type}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{d.status}</span>
              <UploadButton documentId={d.id} onDone={reload} setError={setError} />
              {d.filePath && <a className="text-xs text-sky-600 hover:underline" href={`/api/documents/${d.id}/file`}>download</a>}
              <button className="text-xs text-emerald-600 hover:underline" onClick={() => act(() => api.patch(`/documents/${d.id}/status`, { status: 'verified' }))}>verify</button>
              <button className="text-xs text-rose-500 hover:underline" onClick={() => act(() => api.patch(`/documents/${d.id}/status`, { status: 'rejected' }))}>reject</button>
            </li>
          ))}
          {docs.length === 0 && <li className="text-slate-400">No documents requested.</li>}
        </ul>
        <AddDocForm onAdd={(type) => act(() => api.post('/documents', { applicantId: id, type }))} />
      </Panel>

      {/* Student login (staff provisions the student's portal account) */}
      <StudentLoginPanel applicantId={id} email={a.email} />

      {/* Scholarship / discount */}
      <ScholarshipPanel applicant={a} onSave={(pct, note) => act(() => api.patch(`/applicants/${id}`, { scholarshipPercent: pct, scholarshipNote: note || undefined }))} />

      {/* Semesters (per-term billing + enrolment) */}
      <Panel title="Semesters">
        {terms.length === 0 ? (
          <p className="text-sm text-slate-400">No terms — confirm a program first (the chosen program’s semesters appear here).</p>
        ) : (
          <>
          <p className="text-sm text-slate-500">
            Progress: {terms.filter((t) => t.status === 'enrolled').length} of {terms.length} semesters enrolled
            {terms.length > 0 && terms.every((t) => t.status === 'enrolled') && ' · 🎓 all complete'}
          </p>
          <ul className="space-y-2">
            {terms.map((t) => (
              <TermRow key={t.termId} applicantId={id} term={t} isAdmin={me?.role === 'admin'} act={act} />
            ))}
          </ul>
          </>
        )}
      </Panel>

      {/* Finance */}
      <Panel title="Finance">
        {balance && (
          <p className="text-sm text-slate-500">
            Invoiced {balance.invoiced} · Paid {balance.paid} · Outstanding {balance.outstanding} {balance.currency}
          </p>
        )}
        <button className={btnAlt} onClick={() => act(() => api.post('/invoices', { applicantId: id }))}>Create invoice (from chosen program)</button>
        <ul className="space-y-2 text-sm">
          {invoices.map((inv) => (
            <li key={inv.id} className="rounded-md border border-slate-200 p-2 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span>{inv.amountTotal} {inv.currency} · <span className="text-slate-400">{inv.status}</span></span>
                <span className="flex gap-2">
                  {inv.status === 'draft' && <button className="text-xs text-sky-600 hover:underline" onClick={() => act(() => api.post(`/invoices/${inv.id}/issue`, {}))}>issue</button>}
                  <PayButton invoiceId={inv.id} onDone={reload} setError={setError} />
                </span>
              </div>
            </li>
          ))}
          {invoices.length === 0 && <li className="text-slate-400">No invoices.</li>}
        </ul>
      </Panel>

      {/* Moodle */}
      <Panel title="Moodle">
        <p className="text-sm text-slate-500">Moodle user id: {a.moodleUserId ?? '—'}</p>
        <div className="flex flex-wrap gap-2">
          <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/moodle/provision`, {}))}>Provision / retry</button>
          {me?.role === 'admin' && (
            <button className={btn} onClick={() => act(() => api.post(`/applicants/${id}/moodle/provision-test`, {}))}>Provision to Moodle now (test)</button>
          )}
        </div>
        {me?.role === 'admin' && (
          <p className="text-xs text-slate-400">Admin test: skips the payment gate. The student is enrolled in their chosen program’s Moodle courses (none if the program has no courses).</p>
        )}
      </Panel>

      {/* History */}
      <Panel title="History">
        <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-500 dark:border-slate-700">
          {a.stageTransitions?.map((t) => (
            <li key={t.id}>{t.fromStage ?? '—'} → {t.toStage}{t.note ? ` · ${t.note}` : ''} · {new Date(t.createdAt).toLocaleString()}</li>
          ))}
        </ol>
      </Panel>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProposeForm({ programs, onPropose }: { programs: Program[]; onPropose: (id: string) => void }) {
  const [pid, setPid] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      <select className={inputCls} value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">Program…</option>
        {programs.filter((p) => p.active).map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.level})</option>))}
      </select>
      <button className={btnAlt} disabled={!pid} onClick={() => pid && onPropose(pid)}>Propose</button>
    </div>
  );
}

function AddDocForm({ onAdd }: { onAdd: (type: string) => void }) {
  const [type, setType] = useState('passport');
  return (
    <div className="flex flex-wrap gap-2">
      <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
        {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
      </select>
      <button className={btnAlt} onClick={() => onAdd(type)}>Request document</button>
    </div>
  );
}

function UploadButton({ documentId, onDone, setError }: { documentId: string; onDone: () => void; setError: (e: string | null) => void }) {
  return (
    <label className="cursor-pointer text-xs text-sky-600 hover:underline">
      upload
      <input
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append('file', file);
          try {
            const res = await fetch(`/api/documents/${documentId}/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${getToken()}` },
              body: fd,
            });
            if (!res.ok) throw new Error('Upload failed');
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
          }
        }}
      />
    </label>
  );
}

function ScholarshipPanel({ applicant, onSave }: { applicant: ApplicantDetail; onSave: (pct: number, note: string) => void }) {
  const [pct, setPct] = useState(applicant.scholarshipPercent ?? '0');
  const [note, setNote] = useState(applicant.scholarshipNote ?? '');
  const active = Number(applicant.scholarshipPercent ?? 0) > 0;
  return (
    <Panel title="Scholarship / discount">
      <p className="text-sm text-slate-500">
        A percentage off every semester invoice. {active ? <span className="font-medium text-emerald-700">Currently {applicant.scholarshipPercent}% off.</span> : 'None applied.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-24`} type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} />
        <span className="text-sm text-slate-400">% off</span>
        <input className={`${inputCls} w-64`} placeholder="Note (e.g. merit scholarship)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={btn} onClick={() => onSave(Number(pct), note)}>Save</button>
      </div>
      <p className="text-xs text-slate-400">Applies to semesters invoiced after saving (already-issued invoices are unchanged).</p>
    </Panel>
  );
}

function DField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={value ? '' : 'text-slate-400'}>{value || '—'}</dd>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function DetailsPanel({ applicant, onSave }: { applicant: ApplicantDetail; onSave: (patch: Record<string, unknown>) => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    phone: applicant.phone ?? '',
    dateOfBirth: applicant.dateOfBirth ? applicant.dateOfBirth.slice(0, 10) : '',
    gender: applicant.gender ?? '',
    countryOfOrigin: applicant.countryOfOrigin ?? '',
    residenceCity: applicant.residenceCity ?? '',
    addressLine: applicant.addressLine ?? '',
    priorEducation: applicant.priorEducation ?? '',
    interests: applicant.interests ?? '',
    sponsorName: applicant.sponsorName ?? '',
    sponsorContact: applicant.sponsorContact ?? '',
    emergencyContactName: applicant.emergencyContactName ?? '',
    emergencyContactPhone: applicant.emergencyContactPhone ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  function save() {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) patch[k] = v === '' ? null : v;
    onSave(patch);
    setEdit(false);
  }

  if (!edit) {
    return (
      <Panel title="Details">
        <div className="-mt-9 flex justify-end"><button className="text-xs text-sky-600 hover:underline" onClick={() => setEdit(true)}>edit</button></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <DField label="Email" value={applicant.email} />
          <DField label="Phone" value={applicant.phone} />
          <DField label="Date of birth" value={applicant.dateOfBirth ? new Date(applicant.dateOfBirth).toLocaleDateString() : null} />
          <DField label="Gender" value={applicant.gender} />
          <DField label="Country of origin" value={applicant.countryOfOrigin} />
          <DField label="Residence city" value={applicant.residenceCity} />
          <DField label="Address" value={applicant.addressLine} />
          <DField label="Prior education" value={applicant.priorEducation} />
          <DField label="Interests" value={applicant.interests} />
        </dl>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800 sm:grid-cols-2">
          <DField label="Sponsor" value={applicant.sponsorName ? `${applicant.sponsorName}${applicant.sponsorContact ? ' · ' + applicant.sponsorContact : ''}` : null} />
          <DField label="Emergency contact" value={applicant.emergencyContactName ? `${applicant.emergencyContactName}${applicant.emergencyContactPhone ? ' · ' + applicant.emergencyContactPhone : ''}` : null} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Edit details">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <L label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></L>
        <L label="Date of birth"><input className={inputCls} type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></L>
        <L label="Gender"><select className={inputCls} value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></L>
        <L label="Country of origin"><input className={inputCls} value={f.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} /></L>
        <L label="Residence city"><input className={inputCls} value={f.residenceCity} onChange={(e) => set('residenceCity', e.target.value)} /></L>
        <L label="Address"><input className={inputCls} value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} /></L>
        <L label="Prior education"><input className={inputCls} value={f.priorEducation} onChange={(e) => set('priorEducation', e.target.value)} /></L>
        <L label="Interests"><input className={inputCls} value={f.interests} onChange={(e) => set('interests', e.target.value)} /></L>
        <L label="Sponsor name"><input className={inputCls} value={f.sponsorName} onChange={(e) => set('sponsorName', e.target.value)} /></L>
        <L label="Sponsor contact"><input className={inputCls} value={f.sponsorContact} onChange={(e) => set('sponsorContact', e.target.value)} /></L>
        <L label="Emergency contact name"><input className={inputCls} value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} /></L>
        <L label="Emergency contact phone"><input className={inputCls} value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></L>
      </div>
      <div className="flex gap-2">
        <button className={btn} onClick={save}>Save</button>
        <button className={btnAlt} onClick={() => setEdit(false)}>Cancel</button>
      </div>
    </Panel>
  );
}

function AcademicPanel({ applicantId, moodleUserId }: { applicantId: string; moodleUserId: number | null }) {
  const [t, setT] = useState<Transcript | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!moodleUserId) return;
    api.get<Transcript>(`/applicants/${applicantId}/moodle/transcript`).then(setT).catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }, [applicantId, moodleUserId]);
  if (!moodleUserId) return null;
  return (
    <Panel title="Academic (grades from Moodle)">
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!t ? <p className="text-sm text-slate-400">Loading grades…</p> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="py-1">Course</th><th className="py-1 text-right">Grade</th><th className="py-1 text-right">%</th><th className="py-1 text-right">Done</th></tr></thead>
          <tbody>
            {t.courses.map((c, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">{c.course}</td>
                <td className="py-1 text-right tabular-nums">{c.grade ?? '—'}</td>
                <td className="py-1 text-right tabular-nums">{c.percentage ?? '—'}</td>
                <td className="py-1 text-right">{c.completed == null ? '—' : c.completed ? '✓' : '–'}</td>
              </tr>
            ))}
            {t.courses.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-slate-400">No courses yet.</td></tr>}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function StudentLoginPanel({ applicantId, email }: { applicantId: string; email: string }) {
  const [creds, setCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Student portal login">
      <p className="text-sm text-slate-500">
        Create (or reset) this student&rsquo;s login for the self-service portal. They sign in with{' '}
        <span className="font-medium">{email}</span> and the temporary password below, then set their own.
      </p>
      {err && <p className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-700">{err}</p>}
      {creds && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40">
          Login ready — <span className="font-medium">{creds.email}</span> · temp password:{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{creds.tempPassword}</code>
          <span className="text-slate-400"> (share securely; they change it on first login)</span>
        </p>
      )}
      <button
        className={btnAlt}
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try { setCreds(await api.post(`/auth/students/${applicantId}/login`, {})); }
          catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
          finally { setBusy(false); }
        }}
      >
        {busy ? 'Creating…' : creds ? 'Reset password' : 'Create login'}
      </button>
    </Panel>
  );
}

function TermRow({ applicantId, term, isAdmin, act }: {
  applicantId: string;
  term: ApplicantTermRow;
  isAdmin: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [amount, setAmount] = useState(term.fee);
  const statusColor: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
    invoiced: 'bg-amber-100 text-amber-700',
    paid: 'bg-sky-100 text-sky-700',
    enrolled: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
      <span className="font-medium">{term.name}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[term.status] ?? 'bg-slate-100 text-slate-600'}`}>{term.status}</span>
      <span className="text-slate-400">
        {Number(term.scholarshipPercent) > 0 ? (
          <><span className="line-through">{term.fee}</span> {term.netFee} {term.currency} <span className="text-emerald-600">(−{term.scholarshipPercent}%)</span></>
        ) : (
          <>{term.fee} {term.currency}</>
        )}
        {' · '}{term.courses} courses{Number(term.paid) > 0 ? ` · paid ${term.paid}` : ''}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {term.status === 'pending' && term.locked && (
          <span className="text-xs text-slate-400" title="Pay the earlier semester(s) first">🔒 locked</span>
        )}
        {term.status === 'pending' && !term.locked && (
          <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${applicantId}/terms/${term.termId}/invoice`, {}))}>Invoice</button>
        )}
        {term.invoiceId && term.status !== 'paid' && term.status !== 'enrolled' && (
          <>
            <input className={`${inputCls} w-24`} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className={btn} onClick={() => act(() => api.post(`/invoices/${term.invoiceId}/payments`, { amount: Number(amount), method: 'bank_transfer' }))}>Pay</button>
          </>
        )}
        {term.status === 'paid' && (
          <button className={btn} onClick={() => act(() => api.post(`/applicants/${applicantId}/moodle/terms/${term.termId}/provision`, {}))}>Enrol in Moodle</button>
        )}
        {term.status === 'enrolled' && <span className="text-xs font-medium text-emerald-600">✓ enrolled</span>}
        {isAdmin && term.status !== 'enrolled' && (
          <button className={btnAlt} title="Skip the payment gate (admin test)" onClick={() => act(() => api.post(`/applicants/${applicantId}/moodle/terms/${term.termId}/provision-test`, {}))}>force enrol</button>
        )}
      </span>
    </li>
  );
}

function PayButton({ invoiceId, onDone, setError }: { invoiceId: string; onDone: () => void; setError: (e: string | null) => void }) {
  const [amount, setAmount] = useState('');
  return (
    <span className="flex items-center gap-1">
      <input className={`${inputCls} w-24`} type="number" min="0" step="0.01" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button
        className="text-xs text-emerald-600 hover:underline"
        onClick={async () => {
          try {
            await api.post(`/invoices/${invoiceId}/payments`, { amount: Number(amount), method: 'bank_transfer' });
            setAmount(''); onDone();
          } catch (err) { setError(err instanceof Error ? err.message : 'Payment failed'); }
        }}
      >pay</button>
    </span>
  );
}
