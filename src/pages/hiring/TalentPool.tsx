// ============================================================
// TALENT POOL (keep-warm) — browse pooled candidates and re-engage
// them into an open role. Reactivation creates a fresh application
// for the chosen role (server copies contact + resume; scores are
// re-earned for the new role).
// ============================================================

import { useState } from 'react';
import { Bookmark, Search, UserPlus, X, Check } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STAGE_COLORS: Record<string, string> = {
  Rejected: 'bg-red-100 text-red-700',
  'Not Selected': 'bg-gray-100 text-gray-600',
  Hired: 'bg-green-100 text-green-700',
};

export default function TalentPool() {
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const utils = trpc.useContext();
  const { data: pool, isLoading } = trpc.talentPool.list.useQuery({ q });
  const { data: openRoles } = trpc.talentPool.openRoles.useQuery();

  const reactivate = trpc.talentPool.reactivate.useMutation({
    onSuccess: (r) => { setFlash(`Re-engaged into ${r.jobTitle}. New application created in Candidates.`); utils.talentPool.list.invalidate(); },
  });
  const remove = trpc.talentPool.remove.useMutation({
    onSuccess: () => utils.talentPool.list.invalidate(),
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Bookmark size={20} className="text-ls-primary" />
        <h1 className="text-2xl font-bold text-gray-900">Talent Pool</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">Strong candidates kept warm for future roles. Re-engage one into an open role and a fresh application is created for it.</p>

      {flash && (
        <div className="flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-md px-3 py-2 text-sm mb-4">
          <Check size={15} /> {flash}
          <button onClick={() => setFlash(null)} className="ml-auto text-green-700"><X size={14} /></button>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, or prior role…"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
      ) : !pool?.length ? (
        <div className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-lg">
          No one in the pool yet. Add strong candidates from the Candidates tab with the bookmark button.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Prior role</th>
                <th className="px-4 py-3">CCAT</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Re-engage into an open role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {pool.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 text-sm">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.firstName} {c.lastName}</div>
                    <div className="text-xs text-gray-400">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.priorRole ?? '—'}
                    {c.priorStage && <span className={`ml-2 inline-flex px-2 py-0.5 text-[11px] rounded-full ${STAGE_COLORS[c.priorStage] ?? 'bg-gray-100 text-gray-600'}`}>{c.priorStage}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.ccatScore ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate" title={c.note ?? ''}>{c.note ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select value={picks[c.id] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="px-2 py-1.5 border border-gray-300 rounded-md text-sm max-w-[200px]">
                        <option value="">Select a role…</option>
                        {(openRoles ?? []).map((r) => <option key={r.jdId} value={r.jdId}>{r.jobTitle}</option>)}
                      </select>
                      <button
                        disabled={!picks[c.id] || reactivate.isLoading}
                        onClick={() => reactivate.mutate({ candidateId: c.id, targetJdId: picks[c.id] })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-40 whitespace-nowrap">
                        <UserPlus size={14} /> Re-engage
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove.mutate({ candidateId: c.id })} disabled={remove.isLoading}
                      className="text-xs text-gray-400 hover:text-red-600" title="Remove from pool">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRoles && openRoles.length === 0 && pool && pool.length > 0 && (
        <p className="text-xs text-amber-600 mt-3">No published roles are open right now, so there's nowhere to re-engage candidates yet.</p>
      )}
    </div>
  );
}
