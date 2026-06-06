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
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [ad, progs, dl, inv, bal] = await Promise.all([
        api.get<ApplicantDetail>(`/applicants/${id}`),
        api.get<Program[]>('/programs'),
        api.get<DocumentRec[]>(`/documents?applicantId=${id}`),
        api.get<Invoice[]>(`/invoices?applicantId=${id}`),
        api.get<Balance>(`/applicants/${id}/balance`),
      ]);
      setA(ad); setPrograms(progs); setDocs(dl); setInvoices(inv); setBalance(bal);
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
        <button className={btnAlt} onClick={() => act(() => api.post(`/applicants/${id}/moodle/provision`, {}))}>Provision / retry</button>
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
