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
  type TranscriptCourse,
} from '@/lib/api';
import { Shell } from '@/components/Shell';

const DOC_TYPES = ['passport', 'emirates_id', 'prior_diploma', 'transcript', 'photo', 'legalization', 'other'];
const DOC_LABELS: Record<string, string> = {
  passport: 'Passport', emirates_id: 'Emirates ID', prior_diploma: 'Prior diploma',
  transcript: 'Transcript', photo: 'Photo', legalization: 'Legalization', other: 'Other',
};
const docLabel = (t: string) => DOC_LABELS[t] ?? t;
const docStatusPill = (s: string) =>
  s === 'verified' ? 'bg-emerald-500/15 text-emerald-300'
  : s === 'uploaded' ? 'bg-sky-500/15 text-sky-300'
  : s === 'rejected' ? 'bg-rose-500/15 text-rose-300'
  : 'bg-slate-700 text-slate-300';
const inputCls = 'rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-500 focus:outline-none';
const btn = 'rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50';
const btnAlt = 'rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800';

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
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null);

  async function viewDoc(docId: string) {
    try {
      const token = getToken();
      const res = await fetch(`/api/documents/${docId}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Could not open file (${res.status})`);
      const blob = await res.blob();
      setPreview({ url: URL.createObjectURL(blob), type: blob.type });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file');
    }
  }
  function closePreview() {
    setPreview((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  }

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

  if (!a) return <Shell title="Applicant"><p className="text-slate-400">{error ?? 'Loading…'}</p></Shell>;

  const doneTerms = terms.filter((t) => t.status === 'enrolled').length;
  const totalTerms = terms.length;
  const pct = totalTerms ? Math.round((doneTerms / totalTerms) * 100) : 0;
  const current = [...terms].reverse().find((t) => ['enrolled', 'paid', 'invoiced'].includes(t.status)) ?? terms[0];
  const owes = balance ? Number(balance.outstanding) > 0 : false;

  return (
    <Shell
      title={`${a.firstName} ${a.lastName}`}
      subtitle={`${a.email} · ${a.residenceCity ?? '—'} · from ${a.countryOfOrigin ?? '—'}`}
      actions={
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300">{a.stage}</span>
          <span className="text-slate-500">program: {a.programChoiceStatus}</span>
        </span>
      }
    >
      <div className="space-y-6">
        <a href="/applicants" className="text-sm text-slate-400 hover:text-white">← Applicants</a>
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

        {/* Summary strip */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Progress">
            <div className="text-2xl font-bold text-white">{doneTerms}<span className="text-base font-normal text-slate-500">/{totalTerms || '—'}</span></div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800"><div className="h-full rounded-full bg-purple-500" style={{ width: `${pct}%` }} /></div>
            <div className="mt-1 text-xs text-slate-500">{pct}% of semesters{a.stage === 'graduated' ? ' · 🎓' : ''}</div>
          </Stat>
          <Stat label="Current semester">
            <div className="text-lg font-semibold text-white">{current?.name ?? '—'}</div>
            {current && <div className="text-xs text-slate-500">{current.status}</div>}
          </Stat>
          <Stat label="Outstanding">
            <div className={`text-2xl font-bold ${owes ? 'text-rose-300' : 'text-slate-300'}`}>{balance?.outstanding ?? '—'}</div>
            <div className="text-xs text-slate-500">{balance?.currency ?? ''} · paid {balance?.paid ?? '—'}</div>
          </Stat>
          <Stat label="Moodle">
            <div className="text-lg font-semibold text-white">{a.moodleUserId ? `#${a.moodleUserId}` : 'not enrolled'}</div>
            <div className="text-xs text-slate-500">{a.chosenProgram?.name ?? 'no program'}</div>
          </Stat>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column — profile, documents, admin actions */}
          <div className="space-y-6">
            <DetailsPanel applicant={a} onSave={(patch) => act(() => api.patch(`/applicants/${id}`, patch))} />

            <Panel title="Documents">
              <ul className="space-y-2 text-sm">
                {docs.map((d) => {
                  const uploaded = !!d.filePath;
                  return (
                    <li key={d.id} className="rounded-lg border border-slate-800 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-slate-100">{docLabel(d.type)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${docStatusPill(d.status)}`}>{d.status}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {uploaded
                            ? <button className="text-xs text-purple-400 hover:underline" onClick={() => viewDoc(d.id)}>view file</button>
                            : <span className="text-xs text-slate-500">no file yet</span>}
                          <UploadButton documentId={d.id} onDone={reload} setError={setError} />
                        </span>
                      </div>
                      {uploaded && d.status !== 'verified' && (
                        <div className="mt-2 flex gap-2">
                          <button className="text-xs text-emerald-300 hover:underline" onClick={() => act(() => api.patch(`/documents/${d.id}/status`, { status: 'verified' }))}>verify</button>
                          <button className="text-xs text-rose-300 hover:underline" onClick={() => act(() => api.patch(`/documents/${d.id}/status`, { status: 'rejected' }))}>reject</button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {docs.length === 0 && <li className="text-slate-400">No documents requested yet.</li>}
              </ul>
              <AddDocForm onAdd={(type) => act(() => api.post('/documents', { applicantId: id, type }))} />
            </Panel>

            <StudentLoginPanel applicantId={id} email={a.email} />
            <ScholarshipPanel applicant={a} onSave={(p, note) => act(() => api.patch(`/applicants/${id}`, { scholarshipPercent: p, scholarshipNote: note || undefined }))} />
          </div>

          {/* Right column — the academic + financial story */}
          <div className="space-y-6 lg:col-span-2">
            {me?.role === 'admin' && (a.stage === 'intake_started' || a.stage === 'consultation_booked') && (
              <Panel title="Consultation (test)">
                <p className="text-sm text-slate-500">Admin-only: mark a consultation complete without an advisor/booking. Advances to <code>consultation_completed</code>.</p>
                <button className={btn} onClick={() => act(() => api.post(`/applicants/${id}/test-consultation`, {}))}>Complete consultation (test)</button>
              </Panel>
            )}

            {/* Program selection */}
            <Panel title="Program">
              <p className="text-sm text-slate-400">Proposed: {a.proposedProgram?.name ?? '—'} · Chosen: {a.chosenProgram?.name ?? '—'}{a.choiceAdvisorNote ? ` · note: ${a.choiceAdvisorNote}` : ''}</p>
              <ProposeForm programs={programs} onPropose={(pid) => act(() => api.post(`/applicants/${id}/program/propose`, { programId: pid }))} />
              <div className="flex flex-wrap gap-2">
                <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/program/approve`, {}))}>Approve</button>
                <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/program/reject`, { note: 'reconsider' }))}>Reject</button>
                <button className={btn} onClick={() => act(() => api.post(`/applicants/${id}/program/confirm`, {}))}>Confirm</button>
              </div>
            </Panel>

            {/* Semesters + progress */}
            <Panel title="Semesters & progress">
              {terms.length === 0 ? (
                <p className="text-sm text-slate-400">No semesters yet — confirm a program first.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-slate-800"><div className="h-full rounded-full bg-purple-500" style={{ width: `${pct}%` }} /></div>
                    <span className="text-xs text-slate-400">{doneTerms}/{totalTerms} enrolled{terms.every((t) => t.status === 'enrolled') ? ' · 🎓' : ''}</span>
                  </div>
                  <ul className="space-y-2">
                    {terms.map((t) => <TermRow key={t.termId} applicantId={id} term={t} isAdmin={me?.role === 'admin'} act={act} />)}
                  </ul>
                </>
              )}
            </Panel>

            {/* Courses & grades */}
            <AcademicPanel applicantId={id} />

            {/* Finance */}
            <Panel title="Finance">
              {balance && <p className="text-sm text-slate-400">Invoiced {balance.invoiced} · Paid <span className="text-emerald-300">{balance.paid}</span> · Outstanding <span className={owes ? 'text-rose-300' : ''}>{balance.outstanding}</span> {balance.currency}</p>}
              <p className="text-xs text-slate-500">Invoices are raised per semester — use the <strong>Invoice</strong> button under “Semesters &amp; progress”.</p>
              <ul className="space-y-2 text-sm">
                {invoices.map((inv) => (
                  <li key={inv.id} className="rounded-lg border border-slate-800 p-2">
                    <div className="flex items-center justify-between">
                      <span>{inv.amountTotal} {inv.currency} · <span className="text-slate-400">{inv.status}</span></span>
                      <span className="flex gap-2">
                        {inv.status === 'draft' && <button className="text-xs text-purple-400 hover:underline" onClick={() => act(() => api.post(`/invoices/${inv.id}/issue`, {}))}>issue</button>}
                        <PayButton invoiceId={inv.id} onDone={reload} setError={setError} />
                      </span>
                    </div>
                  </li>
                ))}
                {invoices.length === 0 && <li className="text-slate-400">No invoices.</li>}
              </ul>
            </Panel>

            {/* Moodle */}
            <Panel title="Moodle access">
              <p className="text-sm text-slate-400">Moodle user id: {a.moodleUserId ?? '—'}</p>
              <div className="flex flex-wrap gap-2">
                <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/moodle/provision`, {}))}>Provision / retry</button>
                {me?.role === 'admin' && <button className={btn} onClick={() => act(() => api.post(`/applicants/${id}/moodle/provision-test`, {}))}>Provision now (test)</button>}
              </div>
            </Panel>

            {/* History */}
            <Panel title="History">
              <ol className="space-y-1 border-l-2 border-slate-700 pl-3 text-xs text-slate-500">
                {a.stageTransitions?.map((t) => (
                  <li key={t.id}>{t.fromStage ?? '—'} → {t.toStage}{t.note ? ` · ${t.note}` : ''} · {new Date(t.createdAt).toLocaleString()}</li>
                ))}
              </ol>
            </Panel>
          </div>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8" onClick={closePreview}>
          <div className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <span className="text-sm font-medium text-slate-200">Document preview</span>
              <span className="flex items-center gap-4">
                <a href={preview.url} download className="text-xs text-purple-400 hover:underline">download</a>
                <button onClick={closePreview} className="text-sm text-slate-400 hover:text-white">✕</button>
              </span>
            </div>
            <div className="flex-1 bg-slate-950">
              {preview.type.startsWith('image/')
                ? <img src={preview.url} alt="document" className="mx-auto h-full object-contain" />
                : preview.type === 'application/pdf'
                ? <iframe src={preview.url} className="h-full w-full" title="document preview" />
                : <div className="flex h-full items-center justify-center text-sm text-slate-400">Can’t preview this file type — <a href={preview.url} download className="ml-1 text-purple-400 hover:underline">download it</a>.</div>}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

function ProposeForm({ programs, onPropose }: { programs: Program[]; onPropose: (id: string) => void }) {
  const [pid, setPid] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      <select className={` w-full`} value={pid} onChange={(e) => setPid(e.target.value)}>
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
      <select className={`${inputCls} flex-1`} value={type} onChange={(e) => setType(e.target.value)}>
        {DOC_TYPES.map((t) => (<option key={t} value={t}>{docLabel(t)}</option>))}
      </select>
      <button className={btnAlt} onClick={() => onAdd(type)}>Request document</button>
    </div>
  );
}

function UploadButton({ documentId, onDone, setError }: { documentId: string; onDone: () => void; setError: (e: string | null) => void }) {
  return (
    <label className="cursor-pointer text-xs text-purple-400 hover:underline">
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
        A percentage off every semester invoice. {active ? <span className="font-medium text-emerald-300">Currently {applicant.scholarshipPercent}% off.</span> : 'None applied.'}
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

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DField({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`break-words ${value ? 'text-slate-100' : 'text-slate-500'}`}>{value || '—'}</dd>
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
        <div className="-mt-9 flex justify-end"><button className="text-xs text-purple-400 hover:underline" onClick={() => setEdit(true)}>edit</button></div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
          <DField label="Full name" value={`${applicant.firstName} ${applicant.lastName}`.trim()} className="sm:col-span-2" />
          <DField label="Email" value={applicant.email} />
          <DField label="Phone" value={applicant.phone} />
          <DField label="Date of birth" value={applicant.dateOfBirth ? new Date(applicant.dateOfBirth).toLocaleDateString() : null} />
          <DField label="Gender" value={applicant.gender} />
          <DField label="Country of origin" value={applicant.countryOfOrigin} />
          <DField label="Residence city" value={applicant.residenceCity} />
          <DField label="Address" value={applicant.addressLine} />
          <DField label="Prior education" value={applicant.priorEducation} />
          <DField label="Interests" value={applicant.interests} className="sm:col-span-2" />
        </dl>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-slate-800 pt-5 text-sm sm:grid-cols-2">
          <DField label="Sponsor" value={applicant.sponsorName ? `${applicant.sponsorName}${applicant.sponsorContact ? ' · ' + applicant.sponsorContact : ''}` : null} />
          <DField label="Emergency contact" value={applicant.emergencyContactName ? `${applicant.emergencyContactName}${applicant.emergencyContactPhone ? ' · ' + applicant.emergencyContactPhone : ''}` : null} />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Edit details">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <L label="Phone"><input className={` w-full`} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></L>
        <L label="Date of birth"><input className={` w-full`} type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></L>
        <L label="Gender"><select className={` w-full`} value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></L>
        <L label="Country of origin"><input className={` w-full`} value={f.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} /></L>
        <L label="Residence city"><input className={` w-full`} value={f.residenceCity} onChange={(e) => set('residenceCity', e.target.value)} /></L>
        <L label="Address"><input className={` w-full`} value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} /></L>
        <L label="Prior education"><input className={` w-full`} value={f.priorEducation} onChange={(e) => set('priorEducation', e.target.value)} /></L>
        <L label="Interests"><input className={` w-full`} value={f.interests} onChange={(e) => set('interests', e.target.value)} /></L>
        <L label="Sponsor name"><input className={` w-full`} value={f.sponsorName} onChange={(e) => set('sponsorName', e.target.value)} /></L>
        <L label="Sponsor contact"><input className={` w-full`} value={f.sponsorContact} onChange={(e) => set('sponsorContact', e.target.value)} /></L>
        <L label="Emergency contact name"><input className={` w-full`} value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} /></L>
        <L label="Emergency contact phone"><input className={` w-full`} value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></L>
      </div>
      <div className="flex gap-2">
        <button className={btn} onClick={save}>Save</button>
        <button className={btnAlt} onClick={() => setEdit(false)}>Cancel</button>
      </div>
    </Panel>
  );
}

function AcademicPanel({ applicantId }: { applicantId: string }) {
  const [t, setT] = useState<Transcript | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // null = default (first semester)
  useEffect(() => {
    api.get<Transcript>(`/applicants/${applicantId}/moodle/transcript`).then(setT).catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }, [applicantId]);

  if (err) return <Panel title="Courses & grades"><p className="text-sm text-rose-300">{err}</p></Panel>;
  if (!t) return <Panel title="Courses & grades"><p className="text-sm text-slate-400">Loading…</p></Panel>;
  if (t.courses.length === 0) return <Panel title="Courses & grades"><p className="text-sm text-slate-400">No courses — confirm a program first.</p></Panel>;

  // Group by semester (term), ordered by sequence.
  const groups = new Map<string, { name: string; seq: number; items: TranscriptCourse[] }>();
  for (const c of t.courses) {
    const key = c.term?.name ?? '(no semester)';
    if (!groups.has(key)) groups.set(key, { name: key, seq: c.term?.sequence ?? 999, items: [] });
    groups.get(key)!.items.push(c);
  }
  const terms = Array.from(groups.values()).sort((a, b) => a.seq - b.seq);
  const openTerm = open ?? terms[0]?.name; // first semester open by default
  const totalEnrolled = t.courses.filter((c) => c.enrolled).length;

  return (
    <Panel title="Courses & grades">
      <p className="text-sm text-slate-500">{totalEnrolled} enrolled of {t.courses.length} courses · grades read from Moodle</p>
      <div className="space-y-2">
        {terms.map((term) => {
          const isOpen = openTerm === term.name;
          const enr = term.items.filter((c) => c.enrolled).length;
          return (
            <div key={term.name} className="rounded-lg border border-slate-800 bg-slate-900/40">
              <button onClick={() => setOpen(isOpen ? '__none__' : term.name)} className="flex w-full items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium text-slate-100">{isOpen ? '▾' : '▸'} {term.name}</span>
                <span className="text-xs text-slate-500">{enr > 0 && <span className="text-emerald-300">{enr} enrolled · </span>}{term.items.length} courses</span>
              </button>
              {isOpen && (
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <tr className="border-t border-slate-800">
                      <th className="px-3 py-1 font-medium">Course</th>
                      <th className="w-16 px-3 py-1 text-right font-medium">Grade</th>
                      <th className="w-12 px-3 py-1 text-right font-medium">%</th>
                      <th className="w-16 px-3 py-1 text-right font-medium">Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {term.items.map((c, i) => (
                      <tr key={i} className={`border-t border-slate-800/60 ${c.enrolled ? '' : 'opacity-50'}`}>
                        <td className="px-3 py-1.5 text-slate-200">
                          {c.course}
                          {c.enrolled && <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">enrolled</span>}
                        </td>
                        <td className="w-16 px-3 py-1.5 text-right tabular-nums">{c.grade ?? '—'}</td>
                        <td className="w-12 px-3 py-1.5 text-right tabular-nums">{c.percentage ?? '—'}</td>
                        <td className="w-16 px-3 py-1.5 text-right">{c.completed == null ? '—' : c.completed ? '✓' : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
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
      {err && <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</p>}
      {creds && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
          Login ready — <span className="font-medium">{creds.email}</span> · temp password:{' '}
          <code className="rounded bg-slate-800 px-1">{creds.tempPassword}</code>
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
    pending: 'bg-slate-700 text-slate-300 dark:bg-slate-800',
    invoiced: 'bg-amber-500/15 text-amber-300',
    paid: 'bg-sky-500/15 text-sky-300',
    enrolled: 'bg-emerald-500/15 text-emerald-300',
  };
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm">
      <span className="font-medium">{term.name}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[term.status] ?? 'bg-slate-700 text-slate-300'}`}>{term.status}</span>
      <span className="text-slate-400">
        {Number(term.scholarshipPercent) > 0 ? (
          <><span className="line-through">{term.fee}</span> {term.netFee} {term.currency} <span className="text-emerald-300">(−{term.scholarshipPercent}%)</span></>
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
        {term.status === 'enrolled' && <span className="text-xs font-medium text-emerald-300">✓ enrolled</span>}
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
        className="text-xs text-emerald-300 hover:underline"
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
