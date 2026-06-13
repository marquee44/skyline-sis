'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, getToken, setToken, type AuditLogRow } from '@/lib/api';
import { Shell, Card, dInput } from '@/components/Shell';
import { AuditList } from '@/components/AuditList';

const ENTITIES = ['', 'Applicant', 'Invoice', 'Payment', 'Forward', 'Document', 'Consultation', 'ConsultationRecord', 'TermEnrollment', 'CourseEnrollment', 'Program', 'University', 'Course', 'Term', 'Advisor', 'User', 'KnowledgeEntry'];

export default function AuditPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (entity) qs.set('entity', entity);
      if (entityId.trim()) qs.set('entityId', entityId.trim());
      qs.set('limit', '100');
      setRows(await api.get<AuditLogRow[]>(`/audit?${qs.toString()}`));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setToken(null); router.push('/login'); return; }
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [entity, entityId, router]);

  useEffect(() => { if (!getToken()) { router.push('/login'); return; } reload(); }, [reload, router]);

  return (
    <Shell title="Audit log" subtitle="Every change to records — who · what · when · old → new">
      <div className="max-w-3xl space-y-4">
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <Card
          title="Recent changes"
          action={
            <div className="flex items-center gap-2">
              <select className={dInput} value={entity} onChange={(e) => setEntity(e.target.value)}>
                {ENTITIES.map((en) => <option key={en} value={en}>{en || 'All entities'}</option>)}
              </select>
              <input className={`${dInput} w-56`} placeholder="Record id (optional)" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
            </div>
          }
        >
          {loading ? <p className="text-sm text-slate-400">Loading…</p> : <AuditList rows={rows} />}
        </Card>
      </div>
    </Shell>
  );
}
