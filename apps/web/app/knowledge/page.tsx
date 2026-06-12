'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type KnowledgeEntry } from '@/lib/api';
import { Shell, Card, dInput, dBtn } from '@/components/Shell';

export default function KnowledgePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntries(await api.get<KnowledgeEntry[]>('/knowledge'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (!getToken()) { router.push('/login'); return; } reload(); }, [reload, router]);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await reload(); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
  }

  if (loading) return <Shell title="Knowledge base"><p className="text-slate-400">Loading…</p></Shell>;

  return (
    <Shell title="Admissions knowledge base" subtitle="What the booking-page AI may answer from">
      <div className="max-w-3xl space-y-6">
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <p className="text-sm text-slate-400">
          The public booking assistant answers prospective students <strong>only</strong> from these entries (plus your catalog). Anything not covered, it defers to the advisor. Keep answers factual and short.
        </p>

        <EntryForm onSave={(data) => act(() => api.post('/knowledge', data))} />

        <Card title={`Entries (${entries.length})`}>
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                {editId === e.id ? (
                  <EntryForm
                    initial={e}
                    inline
                    onCancel={() => setEditId(null)}
                    onSave={(data) => { setEditId(null); return act(() => api.patch(`/knowledge/${e.id}`, data)); }}
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{e.question}</span>
                      <span className="flex items-center gap-3 text-xs">
                        {e.category && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-300">{e.category}</span>}
                        <button onClick={() => act(() => api.patch(`/knowledge/${e.id}`, { active: !e.active }))} className={e.active ? 'text-emerald-300' : 'text-slate-500 hover:text-white'}>{e.active ? 'active' : 'hidden'}</button>
                        <button onClick={() => setEditId(e.id)} className="text-purple-400 hover:underline">edit</button>
                        <button onClick={() => act(() => api.del(`/knowledge/${e.id}`))} className="text-rose-300 hover:underline">delete</button>
                      </span>
                    </div>
                    <p className={`whitespace-pre-wrap text-sm ${e.answer.includes('[TODO') ? 'text-amber-300' : 'text-slate-300'}`}>{e.answer}</p>
                  </div>
                )}
              </li>
            ))}
            {entries.length === 0 && <li className="text-sm text-slate-400">No entries yet — add your first FAQ above.</li>}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

function EntryForm({ initial, inline, onSave, onCancel }: {
  initial?: KnowledgeEntry;
  inline?: boolean;
  onSave: (data: { question: string; answer: string; category?: string }) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;
    onSave({ question: question.trim(), answer: answer.trim(), category: category.trim() || undefined });
    if (!inline) { setQuestion(''); setAnswer(''); setCategory(''); }
  }

  const body = (
    <form onSubmit={submit} className="space-y-2">
      <input className={`${dInput} w-full`} placeholder="Question / topic (e.g. What documents do I need?)" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <textarea className={`${dInput} w-full`} rows={3} placeholder="Answer — keep it factual and short" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="flex items-center gap-2">
        <input className={`${dInput} w-40`} placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
        <button className={dBtn} type="submit">{initial ? 'Save' : 'Add entry'}</button>
        {inline && onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>}
      </div>
    </form>
  );

  return inline ? body : <Card title="Add FAQ entry">{body}</Card>;
}
