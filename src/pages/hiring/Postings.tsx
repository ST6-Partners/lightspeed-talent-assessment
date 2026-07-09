import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Trash2, ChevronRight, ChevronDown, Users } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const JD_BADGE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Published: 'bg-green-100 text-green-700',
  Closed: 'bg-red-100 text-red-700',
};

const STAGE_BADGE: Record<string, string> = {
  Applied: 'bg-gray-100 text-gray-600',
  Assessment: 'bg-indigo-100 text-indigo-700',
  'Work Sample': 'bg-purple-100 text-purple-700',
  'Values Review': 'bg-amber-100 text-amber-700',
  'Interview Scheduled': 'bg-blue-100 text-blue-700',
  Interviewed: 'bg-cyan-100 text-cyan-700',
  Offered: 'bg-green-100 text-green-700',
  Hired: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function Postings() {
  const { data: reqs } = trpc.requisitions.list.useQuery();
  const { data: jds } = trpc.jobDescriptions.list.useQuery(undefined);
  const utils = trpc.useContext();
  const windows = trpc.internalOpenings.postingWindows.useQuery();
  const openExternal = trpc.internalOpenings.openExternallyNow.useMutation({
    onSuccess: () => utils.internalOpenings.postingWindows.invalidate(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const { data: candidates } = trpc.candidates.list.useQuery();
  const deleteReq = trpc.requisitions.delete.useMutation({
    onSuccess: () => { setConfirmId(null); utils.requisitions.list.invalidate(); utils.internalOpenings.postingWindows.invalidate(); },
  });
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 10) : '—';

  const open = (reqs ?? []).filter((r: any) => r.status === 'Open');
  const jdByReq: Record<string, any> = {};
  for (const jd of (jds ?? []) as any[]) { if (!jdByReq[jd.reqId]) jdByReq[jd.reqId] = jd; }
  const candByJd: Record<string, any[]> = {};
  for (const c of (candidates ?? []) as any[]) { if (c.jdId) (candByJd[c.jdId] ??= []).push(c); }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={20} className="text-ls-primary" />
        <h1 className="text-2xl font-bold text-gray-900">Open Roles</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">Roles posted from approved intakes — internal first (3-day window), then external.</p>

      <div className="bg-white rounded-lg border border-gray-200">
        {open.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No roles posted yet. Approve an intake all the way through to post a role here.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Hiring Manager</th>
                <th className="px-4 py-3">Openings</th>
                <th className="px-4 py-3">Posting</th>
                <th className="px-4 py-3">Job Description</th>
                <th className="px-4 py-3">Posted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {open.map((r: any) => {
                const jd = jdByReq[r.id];
                const roleCandidates = jd ? (candByJd[jd.id] ?? []) : [];
                const isExpanded = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <button onClick={() => toggle(r.id)} className="inline-flex items-center gap-1.5 text-left hover:text-ls-primary">
                        {isExpanded ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                        <span>{jd?.jobTitle ?? `${r.department} role`}</span>
                        <span className="ml-1 inline-flex items-center gap-1 text-xs text-gray-500 font-normal"><Users size={12} />{roleCandidates.length}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.department}</td>
                    <td className="px-4 py-3 text-gray-600">{r.hiringManager}</td>
                    <td className="px-4 py-3 text-gray-600">{r.numOpenings}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const w = windows.data?.[r.id];
                        const phase = w?.phase ?? 'unknown';
                        const cls = phase === 'external' ? 'bg-green-100 text-green-700' : phase === 'internal' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500';
                        const label = phase === 'external'
                          ? (w?.externallyOpened ? 'External (opened)' : 'External')
                          : phase === 'internal'
                            ? `Internal · ${w?.daysLeft ?? ''}d left`
                            : 'Internal';
                        return (
                          <>
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>{label}</span>
                            <div className="text-xs text-gray-400 mt-0.5">external {fmtDate(w?.externalOpensAt ?? null)}</div>
                            {phase === 'internal' && (
                              <button
                                disabled={openExternal.isLoading && busyId === r.id}
                                onClick={() => { setBusyId(r.id); openExternal.mutate({ reqId: r.id }); }}
                                className="mt-1 text-xs px-2 py-0.5 border border-ls-primary text-ls-primary rounded hover:bg-blue-50 disabled:opacity-50">
                                {openExternal.isLoading && busyId === r.id ? 'Opening…' : 'Open externally now'}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {jd ? (
                        <Link to="/hiring/jobs" className="inline-flex items-center gap-1 text-ls-primary hover:underline">
                          <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${JD_BADGE[(jd as any).pendingReview ? 'Draft' : (jd.status === 'Closed' ? 'Closed' : 'Published')] ?? ''}`}>{(jd as any).pendingReview ? 'Draft' : (jd.status === 'Closed' ? 'Closed' : 'Published')}</span>
                        </Link>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{new Date(r.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {confirmId === r.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-gray-500">Delete role?</span>
                          <button onClick={() => deleteReq.mutate({ id: r.id })} disabled={deleteReq.isLoading}
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50">
                            {deleteReq.isLoading ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button onClick={() => setConfirmId(null)} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(r.id)} title="Delete role"
                          className="p-1 text-gray-400 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={8} className="px-4 pb-4 pt-0">
                        {roleCandidates.length === 0 ? (
                          <div className="text-xs text-gray-400 py-2">No candidates have applied for this role yet.</div>
                        ) : (
                          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                            {roleCandidates.map((c: any) => (
                              <Link key={c.id} to="/hiring/candidates" className="flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                                <span className="text-sm text-gray-800">{c.firstName} {c.lastName}</span>
                                <span className="flex items-center gap-3">
                                  <span className="text-xs text-gray-400">{c.email}</span>
                                  <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_BADGE[c.currentStage] ?? 'bg-gray-100 text-gray-600'}`}>{c.currentStage}</span>
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
