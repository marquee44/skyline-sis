'use client';

import type { AuditLogRow } from '@/lib/api';

const SKIP = new Set(['updatedAt', 'createdAt', 'id']);

function fmt(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

function changes(r: AuditLogRow): { k: string; from: string; to: string }[] {
  const b = (r.before ?? {}) as Record<string, unknown>;
  const a = (r.after ?? {}) as Record<string, unknown>;
  const out: { k: string; from: string; to: string }[] = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (SKIP.has(k)) continue;
    const from = fmt(b[k]);
    const to = fmt(a[k]);
    if (from !== to) out.push({ k, from, to });
  }
  return out;
}

const pill = (a: string) =>
  a === 'create' ? 'bg-emerald-500/15 text-emerald-300'
  : a === 'delete' ? 'bg-rose-500/15 text-rose-300'
  : 'bg-sky-500/15 text-sky-300';

export function AuditList({ rows }: { rows: AuditLogRow[] }) {
  if (!rows.length) return <p className="text-sm text-slate-400">No activity recorded.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => {
        const ch = r.action === 'update' ? changes(r) : [];
        return (
          <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className={`rounded-full px-2 py-0.5 ${pill(r.action)}`}>{r.action}</span>
              <span className="font-medium text-slate-200">{r.entity}</span>
              <span className="text-slate-500">{r.actorEmail ?? 'system / public'}</span>
              <span className="ml-auto">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {r.action === 'update' && (ch.length ? (
              <ul className="mt-1.5 space-y-0.5">
                {ch.map((c) => (
                  <li key={c.k} className="text-xs">
                    <span className="text-slate-400">{c.k}:</span>{' '}
                    <span className="text-rose-300 line-through">{c.from}</span>{' '}
                    <span className="text-slate-500">→</span>{' '}
                    <span className="text-emerald-300">{c.to}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-xs text-slate-500">no field changes</p>)}
            {r.action === 'create' && <p className="mt-1 text-xs text-slate-500">record created</p>}
            {r.action === 'delete' && <p className="mt-1 text-xs text-slate-500">record deleted</p>}
          </li>
        );
      })}
    </ul>
  );
}
