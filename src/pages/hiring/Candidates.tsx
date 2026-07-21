import { useState, useEffect, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, ChevronRight, ChevronLeft, Ban, ChevronDown, Trash2, Info, Archive } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { CANDIDATE_STAGES, PIPELINE_STAGES, CLOSED_STAGES as CLOSED } from '../../../server/src/domain/stages.js';
import RoleRankingDropdown from './RoleRankingDropdown';

const STAGES = CANDIDATE_STAGES;

const STAGE_COLORS: Record<string, string> = {
  Applied: 'bg-purple-100 text-purple-700',
  Assessment: 'bg-blue-100 text-blue-700',
  'Work Sample': 'bg-indigo-100 text-indigo-700',
  'Values Review': 'bg-cyan-100 text-cyan-700',
  'Phone Screen': 'bg-teal-100 text-teal-700',
  'Interview Scheduled': 'bg-yellow-100 text-yellow-700',
  Interviewed: 'bg-orange-100 text-orange-700',
  Offered: 'bg-emerald-100 text-emerald-700',
  Hired: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  'Not Selected': 'bg-gray-100 text-gray-600',
};

type Stage = typeof STAGES[number];

export default function Candidates() {
  const [showForm, setShowForm] = useState(false);
  const [stageFilter, setStageFilter] = useState<Stage | ''>('');
  const [internalFilter, setInternalFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWsScoring, setShowWsScoring] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link support: /hiring/candidates?candidate=<id> preselects that candidate.
  useEffect(() => {
    const c = searchParams.get('candidate');
    if (c) { setSelectedId(c); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [openClosed, setOpenClosed] = useState<Record<string, boolean>>({});
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
    needsSponsorship: false,
    isInternal: false,
    internalEmployee: '',
  });
  const [deptFilter, setDeptFilter] = useState('');
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({});
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const { data: candidates, refetch } = trpc.candidates.list.useQuery(
    stageFilter ? { stage: stageFilter } : undefined
  );
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();
  const { data: requisitions } = trpc.requisitions.list.useQuery();
  const { data: departmentsList } = trpc.departments.list.useQuery();
  const deptByReq: Record<string, string> = {};
  for (const r of (requisitions ?? []) as any[]) deptByReq[r.id] = r.department;
  const jdDepartments = Array.from(new Set(((jobDescriptions ?? []) as any[]).map((j) => deptByReq[j.reqId]).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set([
    ...(((departmentsList ?? []) as any[]).map((d) => d.name)),
    ...jdDepartments,
  ])).sort();
  const jdOptions = deptFilter
    ? ((jobDescriptions ?? []) as any[]).filter((j) => deptByReq[j.reqId] === deptFilter)
    : ((jobDescriptions ?? []) as any[]);

  const createMutation = trpc.candidates.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); resetForm(); },
  });
  const advanceMutation = trpc.candidates.advanceStage.useMutation({
    onSuccess: () => refetch(),
  });
  const rejectMutation = trpc.candidates.reject.useMutation({
    onSuccess: () => { refetch(); setRejectingId(null); setRejectReason(''); },
  });
  const updateMutation = trpc.candidates.update.useMutation({
    onSuccess: () => refetch(),
  });
  const sendWorkSampleMutation = trpc.workSample.send.useMutation({
    onSuccess: (res: any) => {
      refetch();
      if (res?.mode === 'live_walkthrough') {
        alert('This work sample is set to a live walkthrough. A "Work Sample Walkthrough" interview round has been created — schedule it and assign an interviewer in the Interviews tab.');
      }
    },
  });
  const workSampleReviewMutation = trpc.workSample.setReview.useMutation({
    onSuccess: () => refetch(),
  });
  const rescoreWorkSampleMutation = trpc.workSample.rescore.useMutation({
    onSuccess: () => refetch(),
  });
  const deleteMutation = trpc.candidates.delete.useMutation({
    onSuccess: () => { refetch(); setSelectedId(null); },
  });
  const doDelete = (id: string) => {
    deleteMutation.mutate({ id });
  };

  const resetForm = () => setForm({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
    needsSponsorship: false,
    isInternal: false,
    internalEmployee: '',
  });

  // Work Sample is optional per role — skip it in the advance flow unless the
  // candidate's job description opts in (workSampleRequired).
  const requiresWorkSample = (c: any) => {
    if (!c?.jdId) return false;
    const jd = ((jobDescriptions ?? []) as any[]).find((j: any) => j.id === c.jdId);
    // The role includes the Work Sample step if it's explicitly required OR it
    // has a work sample task assigned (take-home or walkthrough). Roles with
    // neither skip the step.
    return jd?.workSampleRequired === true || !!jd?.workSampleTaskId;
  };
  const getPrevStage = (c: any): Stage | null => {
    const idx = STAGES.indexOf(c.currentStage as Stage);
    if (idx <= 0 || c.currentStage === 'Rejected' || c.currentStage === 'Not Selected') return null;
    let prev = STAGES[idx - 1];
    if (prev === 'Work Sample' && !requiresWorkSample(c)) prev = STAGES[idx - 2];
    return (prev as Stage) ?? null;
  };
  const getNextStage = (c: any): Stage | null => {
    const idx = STAGES.indexOf(c.currentStage as Stage);
    let next = STAGES[idx + 1];
    if (next === 'Work Sample' && !requiresWorkSample(c)) next = STAGES[idx + 2];
    if (!next || next === 'Rejected' || next === 'Not Selected') return null;
    return next;
  };

  const getJdTitle = (jdId: string | null) => {
    if (!jdId) return '—';
    return (jobDescriptions ?? []).find((j) => j.id === jdId)?.jobTitle ?? '—';
  };

  const selected = candidates?.find((c) => c.id === selectedId) ?? null;

  const saveNotes = (id: string, field: string, value: string) => {
    updateMutation.mutate({ id, [field]: value });
  };

  const FUNNEL_STAGES: readonly string[] = PIPELINE_STAGES;
  const toggleRole = (jdId: string) => setCollapsedRoles((m) => ({ ...m, [jdId]: !m[jdId] }));

  const CLOSED_STAGES: readonly string[] = CLOSED;
  const matchesInternal = (c: any) =>
    internalFilter === 'all' || (internalFilter === 'internal' ? c.isInternal : !c.isInternal);

  // Active applicants (drives the top stat cards).
  const visibleCandidates = ((candidates ?? []) as any[]).filter((c: any) =>
    matchesInternal(c) && !CLOSED_STAGES.includes(c.currentStage)
  );
  const jdById: Record<string, any> = {};
  for (const j of (jobDescriptions ?? []) as any[]) jdById[j.id] = j;
  const reqById: Record<string, any> = {};
  for (const r of (requisitions ?? []) as any[]) reqById[r.id] = r;

  // Group EVERY candidate (active + closed) by role, so a filled/closed role
  // still shows a card with its own closed-out list.
  const groupMap = new Map<string, any[]>();
  for (const c of ((candidates ?? []) as any[]).filter(matchesInternal)) {
    const key = c.jdId ?? 'none';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(c);
  }
  const roleGroups = Array.from(groupMap.entries()).map(([jdId, all]) => {
    const cands = all
      .filter((c: any) => !CLOSED_STAGES.includes(c.currentStage))
      .sort((a: any, b: any) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return sortOrder === 'oldest' ? ta - tb : tb - ta;
      });
    const closed = all
      .filter((c: any) => CLOSED_STAGES.includes(c.currentStage))
      .sort((a: any, b: any) => String(a.currentStage).localeCompare(String(b.currentStage)));
    const counts: Record<string, number> = {};
    for (const c of cands) counts[c.currentStage] = (counts[c.currentStage] ?? 0) + 1;
    return {
      jdId,
      cands,
      closed,
      counts,
      title: jdId === 'none' ? 'Unassigned role' : getJdTitle(jdId),
      dept: jdId === 'none' ? '' : (deptByReq[jdById[jdId]?.reqId] ?? ''),
      hm: jdId === 'none' ? '' : (reqById[jdById[jdId]?.reqId]?.hiringManager ?? ''),
    };
  }).sort((a, b) => b.cands.length - a.cands.length);

  const candidateRow = (c: any) => {
    const nextStage = getNextStage(c);
    return (
      <tr key={c.id} onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
        className={`border-b border-gray-50 text-sm cursor-pointer transition-colors ${selectedId === c.id ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
        <td className="px-4 py-3 font-medium text-gray-900">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{`${(c.firstName?.[0] ?? '')}${(c.lastName?.[0] ?? '')}`}</span>
            <span>{c.firstName} {c.lastName}{c.isInternal && <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 align-middle">Internal</span>}{c.screenRecommendation === 'review' && c.currentStage !== 'Rejected' && c.currentStage !== 'Hired' && c.currentStage !== 'Not Selected' && <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-red-100 text-red-700 align-middle" title="Below the auto-advance bar — awaiting human review in the Review tab">Review</span>}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-500">{c.email}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_COLORS[c.currentStage] ?? ''}`}>{c.currentStage}</span>
        </td>
        <td className="px-4 py-3 text-gray-500">{c.ccatScore ?? '\u2014'}</td>
        <td className="px-4 py-3 text-gray-500">{c.eppValuesMatchScore != null ? `${c.eppValuesMatchScore}%` : '\u2014'}</td>
        <td className="px-4 py-3 text-gray-500">{c.companyValuesMatchScore != null ? `${c.companyValuesMatchScore}%` : '\u2014'}</td>
        <td className="px-4 py-3 text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            {getPrevStage(c) && (
              <button onClick={() => advanceMutation.mutate({ id: c.id, toStage: getPrevStage(c)! })} disabled={advanceMutation.isLoading} className="p-1 text-gray-400 hover:text-amber-600 transition-colors" title={`Move back to ${getPrevStage(c)}`}>
                <ChevronLeft size={16} />
              </button>
            )}
            {nextStage && (
              <button onClick={() => advanceMutation.mutate({ id: c.id, toStage: nextStage })} disabled={advanceMutation.isLoading} className="p-1 text-gray-400 hover:text-green-600 transition-colors" title={`Advance to ${nextStage}`}>
                <ChevronRight size={16} />
              </button>
            )}
            {c.currentStage !== 'Rejected' && c.currentStage !== 'Hired' && c.currentStage !== 'Not Selected' && (
              <button onClick={() => setRejectingId(c.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Reject">
                <Ban size={15} />
              </button>
            )}
            <button onClick={() => doDelete(c.id)} disabled={deleteMutation.isLoading} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete (build tool)">
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="flex gap-4">
      {/* Main panel */}
      <div className={selectedId ? 'flex-1 min-w-0' : 'w-full'}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
            <p className="text-gray-500 text-sm mt-1">Track every applicant through the pipeline</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
          >
            <Plus size={16} />
            Add Candidate
          </button>
        </div>

        <TimelineAlerts />

        {/* Stage filter — single dropdown instead of an open chip row */}
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="stage-filter" className="text-xs font-medium text-gray-500">Stage</label>
          <select
            id="stage-filter"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as Stage | '')}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          >
            <option value="">All stages</option>
            {STAGES.filter((s) => s !== 'Rejected' && s !== 'Not Selected').map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label htmlFor="sort-order" className="ml-3 text-xs font-medium text-gray-500">Sort</label>
          <select
            id="sort-order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          >
            <option value="newest">Newest applied first</option>
            <option value="oldest">Oldest applied first</option>
          </select>
        </div>

        {/* Internal / external filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'external', 'internal'] as const).map((v) => (
            <button key={v} onClick={() => setInternalFilter(v)}
              className={`px-3 py-1 text-xs rounded-full border ${internalFilter === v ? 'bg-ls-primary text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}>
              {v === 'all' ? 'All applicants' : v === 'internal' ? 'Internal' : 'External'}
            </button>
          ))}
        </div>

        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-700">Add Candidate</span>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                <input type="text" value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                <input type="text" value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <select value={deptFilter} onChange={(e) => {
                    const dept = e.target.value;
                    setDeptFilter(dept);
                    const cur = ((jobDescriptions ?? []) as any[]).find((j) => j.id === form.jdId);
                    if (dept && cur && deptByReq[cur.reqId] !== dept) setForm({ ...form, jdId: '' });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">— All departments —</option>
                  {deptOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                <select value={form.jdId} onChange={(e) => setForm({ ...form, jdId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">— Not linked yet —</option>
                  {jdOptions.map((j) => (
                    <option key={j.id} value={j.id}>{j.jobTitle}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">Select source</option>
                  {['LinkedIn', 'Indeed', 'Referral', 'Company Website', 'Recruiter', 'Other'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
                <input type="url" value={form.linkedinUrl}
                  onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Resume URL</label>
                <input type="url" value={form.resumeUrl}
                  onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.needsSponsorship}
                    onChange={(e) => setForm({ ...form, needsSponsorship: e.target.checked })}
                  />
                  Requires international sponsorship (candidate self-reports on the application — auto-declines on submit)
                </label>
              </div>
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isInternal} onChange={(e) => setForm({ ...form, isInternal: e.target.checked })} />
                Internal candidate (current Lightspeed employee)
              </label>
              {form.isInternal && (
                <input value={form.internalEmployee} onChange={(e) => setForm({ ...form, internalEmployee: e.target.value })}
                  placeholder="Current role / manager (optional)"
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => createMutation.mutate({ ...form, jdId: form.jdId || undefined })}
                disabled={!form.firstName || !form.lastName || !form.email || createMutation.isLoading}
                className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50"
              >
                {createMutation.isLoading ? 'Adding...' : 'Add Candidate'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Reject modal */}
        {rejectingId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg border border-gray-200 p-5 w-96">
              <div className="text-sm font-semibold text-gray-700 mb-3">Reject Candidate</div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                rows={3} placeholder="e.g. CCAT score below threshold, not the right fit..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan mb-3" />
              <div className="flex gap-2">
                <button
                  onClick={() => rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
                  disabled={!rejectReason || rejectMutation.isLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectMutation.isLoading ? 'Rejecting...' : 'Reject'}
                </button>
                <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open roles</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{roleGroups.filter((g) => g.jdId !== 'none' && g.cands.length > 0).length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">In pipeline</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{visibleCandidates.length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Offers out</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{visibleCandidates.filter((c: any) => c.currentStage === 'Offered').length}</div>
          </div>
        </div>

        {roleGroups.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">No candidates found.</div>
        ) : (
          <div className="space-y-3">
            {roleGroups.map((g) => {
              const collapsed = collapsedRoles[g.jdId];
              const maxN = Math.max(1, ...FUNNEL_STAGES.map((st) => g.counts[st] ?? 0));
              return (
                <div key={g.jdId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleRole(g.jdId)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ChevronDown size={16} className={`text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                          <span className="text-base font-semibold text-gray-900">{g.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-gray-500 flex-wrap">
                          {g.dept && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{g.dept}</span>}
                          {g.hm && <span>{g.hm}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 ml-6">
                      {FUNNEL_STAGES.map((st) => {
                        const n = g.counts[st] ?? 0;
                        const h = Math.max(3, Math.round((n / maxN) * 28));
                        return (
                          <div key={st} className="flex-1 text-center" title={`${st}: ${n}`}>
                            <div className="text-sm font-semibold text-gray-900">{n}</div>
                            <div className="mx-auto my-1 rounded" style={{ height: `${h}px`, background: n ? '#93b5e8' : '#eef1f5' }} />
                            <div className="text-[10px] text-gray-400 leading-tight">{st}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {!collapsed && g.jdId !== 'none' && g.cands.length > 0 && <RoleRankingDropdown jdId={g.jdId} />}
                  {!collapsed && g.cands.length > 0 && (
                    <div className="border-t border-gray-100 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                            <th className="px-4 py-2.5">Name</th>
                            <th className="px-4 py-2.5">Email</th>
                            <th className="px-4 py-2.5">Stage</th>
                            <th className="px-4 py-2.5">CCAT</th>
                            <th className="px-4 py-2.5">EPP Match</th>
                            <th className="px-4 py-2.5">Values Match</th>
                            <th className="px-4 py-2.5">Applied</th>
                            <th className="px-4 py-2.5 w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.cands.map((c: any) => candidateRow(c))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!collapsed && g.closed.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <button
                        onClick={() => setOpenClosed((m) => ({ ...m, [g.jdId]: !m[g.jdId] }))}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
                      >
                        <ChevronDown size={15} className={`text-gray-400 transition-transform ${openClosed[g.jdId] ? '' : '-rotate-90'}`} />
                        <Archive size={15} className="text-gray-400" />
                        <span>Closed out</span>
                        <span className="text-gray-400 font-normal">· {g.closed.length}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {g.closed.filter((c: any) => c.currentStage === 'Rejected').length > 0 && (
                            <span className="inline-flex px-2 py-0.5 text-[11px] rounded-full bg-red-100 text-red-700">
                              {g.closed.filter((c: any) => c.currentStage === 'Rejected').length} rejected
                            </span>
                          )}
                          {g.closed.filter((c: any) => c.currentStage === 'Not Selected').length > 0 && (
                            <span className="inline-flex px-2 py-0.5 text-[11px] rounded-full bg-gray-200 text-gray-600">
                              {g.closed.filter((c: any) => c.currentStage === 'Not Selected').length} not selected
                            </span>
                          )}
                        </span>
                      </button>
                      {openClosed[g.jdId] && (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full">
                            <tbody>
                              {g.closed.map((c: any) => (
                                <tr key={c.id} className="border-b border-gray-50 text-sm">
                                  <td className="px-2 py-2 font-medium text-gray-700">{c.firstName} {c.lastName}</td>
                                  <td className="px-2 py-2">
                                    <span className={`inline-flex px-2 py-0.5 text-[11px] rounded-full ${STAGE_COLORS[c.currentStage] ?? 'bg-gray-100 text-gray-600'}`}>
                                      {c.currentStage}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-gray-400 text-xs">{c.email}</td>
                                  <td className="px-2 py-2 text-gray-400 text-xs">{c.rejectionReason ?? ''}</td>
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      onClick={() => doDelete(c.id)}
                                      disabled={deleteMutation.isLoading}
                                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                      title="Delete (build tool)"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-96 flex-shrink-0 bg-white rounded-lg border border-gray-200 p-5 self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</div>
              <div className="text-xs text-gray-500">{selected.email}</div>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium mb-4 ${STAGE_COLORS[selected.currentStage] ?? ''}`}>
            {selected.currentStage}
          </span>

          {/* Scores summary */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'CCAT Score', value: selected.ccatScore },
              { label: 'EPP Match', value: selected.eppValuesMatchScore != null ? `${selected.eppValuesMatchScore}%` : null },
              { label: 'Values Match', value: (selected as any).companyValuesMatchScore != null ? `${(selected as any).companyValuesMatchScore}%` : null, hint: 'How well the candidate fits this role, scored against the EPP values selected for this job.' },
              { label: 'Work Sample', value: selected.workSampleScore },
              { label: 'Resume Review', value: selected.resumeReviewScore },
              { label: 'Interview Score', value: (selected as any).interviewScore },
            ].map(({ label, value, hint }: any) => (
              <div key={label} className={`bg-gray-50 rounded p-2 ${hint ? 'cursor-help' : ''}`} title={hint}>
                <div className="text-xs text-gray-500 flex items-center gap-1">{label}{hint && <Info size={13} className="text-ls-primary shrink-0" aria-label={hint} />}</div>
                <div className="text-sm font-medium text-gray-900">{value ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Role fit (values) — how the candidate does/doesn't fit this role on the JD's EPP values */}
          {(selected as any).companyValuesNotes && (
            <Section title="Role Fit (values)">
              <div className="text-xs text-gray-700 whitespace-pre-wrap">{(selected as any).companyValuesNotes}</div>
            </Section>
          )}

          {/* Work Sample */}
          <Section title="Work Sample">
            {(selected as any).workSampleSubmittedAt ? (
              <div className="space-y-2">
                <div className="text-xs text-green-700">
                  Submitted {new Date((selected as any).workSampleSubmittedAt).toLocaleString()}
                </div>
                <div className="bg-gray-50 rounded p-2 text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {(selected as any).workSampleSubmission || '(no written response)'}
                </div>
                {(selected as any).workSampleLink && (
                  <a href={(selected as any).workSampleLink} target="_blank" rel="noreferrer"
                     className="text-xs text-ls-primary underline break-all">
                    {(selected as any).workSampleLink}
                  </a>
                )}
                <div className="pt-1">
                  <button
                    onClick={() => rescoreWorkSampleMutation.mutate({ id: selected.id })}
                    disabled={rescoreWorkSampleMutation.isLoading}
                    className="text-xs px-3 py-1.5 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50"
                  >
                    {rescoreWorkSampleMutation.isLoading
                      ? 'Scoring…'
                      : (selected as any).workSampleScore != null ? 'Re-score with AI' : 'Score with AI'}
                  </button>
                  <div className="text-[11px] text-gray-400 mt-1">AI draft against the task rubric — advisory, never auto-rejects. Re-run after a work sample changes.</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic">No submission yet.</div>
            )}

            {(selected as any).workSampleScore != null && (
              <div className="pt-1">
                <button
                  onClick={() => setShowWsScoring(!showWsScoring)}
                  className="flex items-center gap-1 text-xs font-medium text-ls-primary"
                >
                  <ChevronDown size={12} className={`transition-transform ${showWsScoring ? '' : '-rotate-90'}`} />
                  {showWsScoring ? 'Hide scoring breakdown' : 'View scoring breakdown'}
                </button>
                {showWsScoring && (
                  <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-lg font-semibold text-gray-900">{(selected as any).workSampleScore}</span>
                      <span className="text-xs text-gray-500">/ 100 overall</span>
                    </div>
                    {(selected as any).workSampleNotes ? (
                      <div className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">{(selected as any).workSampleNotes}</div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">Scored, but no breakdown was saved. Re-score with AI to regenerate it.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="pt-1">
              <button
                onClick={() => sendWorkSampleMutation.mutate({ id: selected.id })}
                disabled={sendWorkSampleMutation.isLoading}
                className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
              >
                {sendWorkSampleMutation.isLoading
                  ? 'Sending…'
                  : (selected as any).workSampleToken ? 'Resend work-sample link' : 'Send work-sample link'}
              </button>
              {sendWorkSampleMutation.data?.url && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-0.5">Link emailed — shareable URL:</div>
                  <div className="flex gap-1">
                    <input
                      readOnly
                      value={sendWorkSampleMutation.data.url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-gray-50"
                    />
                    <button
                      onClick={() => navigator.clipboard?.writeText(sendWorkSampleMutation.data!.url!)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-1">
              <EditableField
                label="Work Sample Score (0–100)"
                value={(selected as any).workSampleScore != null ? String((selected as any).workSampleScore) : ''}
                onSave={(v) => workSampleReviewMutation.mutate({
                  id: selected.id,
                  score: v.trim() === '' ? null : Math.max(0, Math.min(100, parseInt(v) || 0)),
                })}
              />
              <EditableTextarea
                label="Work Sample Review Notes"
                value={(selected as any).workSampleNotes ?? ''}
                onSave={(v) => workSampleReviewMutation.mutate({ id: selected.id, notes: v })}
              />
            </div>
          </Section>

          {/* Interview management moved to the Interviews tab */}
          <Section title="Interviews">
            <div className="text-xs text-gray-600">
              Interviewer, scheduling, rounds, questions, transcript and feedback are managed on the{' '}
              <a href={`/hiring/interviews?id=${selected.id}`} className="text-ls-primary underline">Interviews tab</a>.
            </div>
          </Section>

          {/* Resume screen — checks resume vs REQUIRED qualifications only */}
          <CombinedScreenSection key={selected.id} candidateId={selected.id} existingSummary={(selected as any).screenSummary ?? null} onChanged={refetch} />

          {/* Offer letter — internal moves get a before/now comparison; external gets the standard letter */}
          {(selected as any).isInternal
            ? <InternalOfferSection key={`ioffer-${selected.id}`} candidateId={selected.id} onChanged={refetch} />
            : <OfferSection key={`offer-${selected.id}`} candidateId={selected.id} onChanged={refetch} />}

          {/* HR notes */}
          <Section title="General Notes">
            <EditableTextarea
              label="Notes"
              value={selected.notes ?? ''}
              onSave={(v) => saveNotes(selected.id, 'notes', v)}
            />
          </Section>

          {/* Decision history — Phase 2 provenance trail (model + prompt version + reason) */}
          <DecisionHistorySection key={`dh-${selected.id}`} candidateId={selected.id} />
          <EeoInviteSection key={`eeo-${selected.id}`} candidateId={selected.id} />
          {selected.currentStage === 'Phone Screen' && <PhoneScreenSchedulingSection key={`ps-${selected.id}`} candidate={selected} onChanged={refetch} />}

        </div>
      )}
    </div>
  );
}

// ── Decision history (Phase 2 provenance) ──────────────────
const DECISION_LABELS: Record<string, string> = {
  assessment_gate: 'Assessment gate',
  post_assessment_review: 'Post-assessment review',
  resume_screen: 'Resume screen',
  work_sample: 'Work sample',
  interview_questions: 'Interview questions',
  interview_feedback: 'Interview feedback',
  manual_stage_change: 'Manual stage change',
};

function outcomeClasses(outcome: string): string {
  switch (outcome) {
    case 'passed':
    case 'advanced': return 'bg-green-100 text-green-700';
    case 'rejected':
    case 'failed': return 'bg-red-100 text-red-700';
    case 'pending_review': return 'bg-amber-100 text-amber-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

const EEO_STATUS_LABEL: Record<string, string> = {
  not_sent: 'Not sent', invited: 'Invited (awaiting response)', submitted: 'Completed', declined: 'Declined',
};
export function EeoInviteSection({ candidateId }: { candidateId: string }) {
  const { data, refetch } = trpc.eeo.status.useQuery({ candidateId });
  const invite = trpc.eeo.invite.useMutation({ onSuccess: () => refetch() });
  const status = data?.status ?? 'not_sent';
  const sent = status === 'invited' || status === 'submitted' || status === 'declined';
  return (
    <Section title="Voluntary self-ID survey">
      <div className="text-xs text-gray-500 mb-2">
        Voluntary EEO self-identification, used only in aggregate for the fairness audit. Responses are
        confidential and never shown here or to anyone making hiring decisions. You only see whether it was sent.
      </div>
      <div className="flex items-center gap-3">
        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${status === 'submitted' ? 'bg-green-100 text-green-700' : status === 'declined' ? 'bg-gray-100 text-gray-600' : status === 'invited' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
          {EEO_STATUS_LABEL[status] ?? status}
        </span>
        <button
          onClick={() => invite.mutate({ candidateId })}
          className="text-xs px-3 py-1.5 rounded-md bg-ls-primary text-white hover:opacity-90 disabled:opacity-40"
          disabled={invite.isLoading || status === 'submitted'}>
          {invite.isLoading ? 'Sending...' : sent ? 'Resend survey' : 'Send self-ID survey'}
        </button>
      </div>
    </Section>
  );
}

export function DecisionHistorySection({ candidateId }: { candidateId: string }) {
  const { data: decisions, isLoading } = trpc.decisions.listByCandidate.useQuery({ candidateId });

  return (
    <Section title="Decision History">
      <div className="text-xs text-gray-500 mb-2">
        Every automated, rule-based, and human decision for this candidate — with the model and prompt version
        that produced it, and a plain-language reason. Read-only audit trail.
      </div>
      {isLoading && <div className="text-xs text-gray-400">Loading…</div>}
      {!isLoading && (!decisions || decisions.length === 0) && (
        <div className="text-xs text-gray-400">No decisions recorded yet for this candidate.</div>
      )}
      <div className="space-y-2">
        {(decisions ?? []).map((d: any) => (
          <div key={d.id} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-medium text-gray-900">{DECISION_LABELS[d.decisionType] ?? d.decisionType}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${outcomeClasses(d.outcome)}`}>{d.outcome}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                {d.decidedByType === 'ai' ? 'AI' : d.decidedByType === 'human' ? 'Human' : 'Rule'}
              </span>
              <span className="flex-1" />
              <span className="text-[11px] text-gray-400">{d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}</span>
            </div>
            {d.reason && <div className="text-xs text-gray-600 leading-relaxed mb-1">{d.reason}</div>}
            <div className="text-[11px] text-gray-400 font-mono">
              {d.score != null && <>score {d.score} · </>}
              {d.model ? <>{d.model}{d.promptId ? <> · prompt {d.promptId} {d.promptVersion}</> : null}</> : <>decided by {d.decidedByType}</>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Sub-components ─────────────────────────────────────────

export function InterviewFeedbackSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const run = trpc.candidates.processInterview.useMutation({
    onSuccess: (r) => { setResult(r); onChanged?.(); },
  });

  const hr = result?.feedbackHr ?? candidate.interviewFeedbackHr;
  const cand = result?.feedbackCandidate ?? candidate.interviewFeedbackCandidate;
  const interviewer = result?.feedbackInterviewer ?? candidate.interviewFeedbackInterviewer;
  const score = result?.interviewScore ?? candidate.interviewScore;
  const storedTranscript = result?.transcript ?? candidate.interviewTranscript;
  const hasAny = hr || cand || interviewer;

  return (
    <Section title="Interview Transcript & Feedback">
      <div className="text-xs text-gray-500">
        When the interview finishes, the recording is turned into a transcript and analyzed into feedback for the
        candidate, the hiring manager, and the interviewer — then the interviewer is emailed their summary. Zoom
        isn&apos;t connected yet, so paste a transcript below, or just run it to use a generated sample.
      </div>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the interview transcript here (optional — leave blank to use a generated sample)…"
        rows={4}
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono mt-1"
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => run.mutate({ id: candidate.id, transcript: transcript.trim() || undefined })}
          disabled={run.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {run.isLoading ? 'Processing…' : (hasAny ? 'Re-run feedback + email interviewer' : 'Generate feedback + email interviewer')}
        </button>
        {score != null && <span className="text-xs text-gray-600">Score: <strong>{score}/100</strong></span>}
      </div>

      {run.error && <div className="text-xs text-red-600">{run.error.message}</div>}

      {result && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 mt-1">
          Done — transcript {result.transcriptSource === 'generated' ? 'generated (sample)' : result.transcriptSource === 'provided' ? 'from your paste' : 'from stored'}.
          {' '}Interviewer summary {result.emailedInterviewer ? 'emailed' : 'not sent (no interviewer email on file)'}.
        </div>
      )}

      {interviewer && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mt-2 mb-0.5">Interviewer coaching summary</div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{interviewer}</p>
        </div>
      )}
      {hr && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mt-2 mb-0.5">Hiring-manager debrief</div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{hr}</p>
        </div>
      )}
      {cand && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mt-2 mb-0.5">Candidate-facing feedback</div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{cand}</p>
        </div>
      )}
      {storedTranscript && (
        <div className="pt-1">
          <button onClick={() => setShowTranscript((v) => !v)} className="text-xs text-ls-primary underline">
            {showTranscript ? 'Hide transcript' : 'View transcript'}
          </button>
          {showTranscript && (
            <pre className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2 mt-1 max-h-64 overflow-y-auto">{storedTranscript}</pre>
          )}
        </div>
      )}
    </Section>
  );
}


export function InterviewRoundsSection({ candidateId, onChanged }: { candidateId: string; onChanged?: () => void }) {
  const rounds = trpc.interviews.list.useQuery({ candidateId });
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [briefingFor, setBriefingFor] = useState<string | null>(null);
  const [newRound, setNewRound] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const isOpen = (id: string) => expanded[id] ?? false;

  const refresh = () => { rounds.refetch(); onChanged?.(); };
  const seed = trpc.interviews.seedFromPlan.useMutation({
    onSuccess: (result: any) => {
      const n = Array.isArray(result) ? result.length : 0;
      setSeedMsg(n === 0
        ? "No rounds are defined on this role's intake (or this candidate isn't linked to a role yet), so there was nothing to pull. Add rounds manually below."
        : null);
      refresh();
    },
  });
  const add = trpc.interviews.addRound.useMutation({ onSuccess: () => { setNewRound(''); refresh(); } });
  const update = trpc.interviews.updateRound.useMutation({ onSuccess: () => rounds.refetch() });
  const remove = trpc.interviews.removeRound.useMutation({ onSuccess: refresh });
  const record = trpc.interviews.recordFeedback.useMutation({ onSuccess: refresh });
  const sendPrep = trpc.interviews.sendPrep.useMutation({ onSuccess: () => rounds.refetch() });
  const briefing = trpc.interviews.briefing.useQuery({ id: briefingFor ?? '' }, { enabled: !!briefingFor });

  const list = (rounds.data ?? []) as any[];
  const statusStyle: Record<string, string> = {
    planned: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  };
  const followLabel: Record<string, string> = { avoided: 'Avoided', half_answered: 'Half-answered', suggested: 'Suggested' };

  return (
    <Section title="Interview Rounds">
      <div className="text-xs text-gray-500">
        Each round is tracked on its own — interviewer, transcript, score, and feedback. When you email an
        interviewer their prep, it includes the read on the candidate from earlier completed rounds (scores hidden)
        plus a follow-up list, and leaves out the coaching notes written for the earlier interviewers.
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          onClick={() => seed.mutate({ candidateId })}
          disabled={seed.isLoading}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {seed.isLoading ? 'Seeding…' : 'Seed rounds from plan'}
        </button>
        <input
          value={newRound}
          onChange={(e) => setNewRound(e.target.value)}
          placeholder="New round name (e.g. Final with VP)"
          className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[180px]"
        />
        <button
          onClick={() => newRound.trim() && add.mutate({ candidateId, roundName: newRound.trim() })}
          disabled={add.isLoading || !newRound.trim()}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
        >
          Add round
        </button>
      </div>

      {seedMsg && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">{seedMsg}</div>
      )}

      {list.length === 0 && (
        <div className="text-xs text-gray-400 pt-2">No rounds yet. Seed from the interview plan or add one.</div>
      )}

      <div className="space-y-2 pt-2">
        {list.map((r) => {
          const fus = Array.isArray(r.followUps) ? r.followUps : [];
          return (
            <div key={r.id} className="border border-gray-200 rounded p-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !(e[r.id] ?? false) }))} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${isOpen(r.id) ? '' : '-rotate-90'}`} />
                  <span className="text-xs font-semibold text-gray-800 truncate">{r.roundName}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusStyle[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  {r.score != null && <span className="text-[11px] text-gray-500 shrink-0">score {r.score}/100</span>}
                  {!isOpen(r.id) && r.interviewerName && <span className="text-[11px] text-gray-400 truncate">· {r.interviewerName}</span>}
                  {!isOpen(r.id) && r.prepSentAt && <span className="text-[11px] text-green-600 shrink-0">· prep emailed</span>}
                </button>
                <button onClick={() => remove.mutate({ id: r.id })} className="text-[11px] text-gray-400 hover:text-red-600 shrink-0">Remove</button>
              </div>
              {isOpen(r.id) && (<div className="mt-1.5">

              <div className="flex flex-wrap gap-2 mt-1.5">
                <input
                  defaultValue={r.interviewerName ?? ''}
                  onBlur={(e) => e.target.value !== (r.interviewerName ?? '') && update.mutate({ id: r.id, interviewerName: e.target.value || null })}
                  placeholder="Interviewer name"
                  className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[130px]"
                />
                <input
                  defaultValue={r.interviewerEmail ?? ''}
                  onBlur={(e) => e.target.value !== (r.interviewerEmail ?? '') && update.mutate({ id: r.id, interviewerEmail: e.target.value || null })}
                  placeholder="Interviewer email"
                  className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[160px]"
                />
              </div>

              <textarea
                value={transcripts[r.id] ?? ''}
                onChange={(e) => setTranscripts((t) => ({ ...t, [r.id]: e.target.value }))}
                placeholder="Paste this round's transcript (optional — leave blank for a generated sample)…"
                rows={2}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono mt-1.5"
              />

              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <button
                  onClick={() => record.mutate({ id: r.id, transcript: (transcripts[r.id] ?? '').trim() || undefined })}
                  disabled={record.isLoading}
                  className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
                >
                  {record.isLoading ? 'Processing…' : (r.status === 'completed' ? 'Re-run feedback' : 'Record feedback')}
                </button>
                <button
                  onClick={() => sendPrep.mutate({ id: r.id })}
                  disabled={sendPrep.isLoading || !r.interviewerEmail}
                  title={r.interviewerEmail ? '' : 'Set an interviewer email first'}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Email prep + briefing
                </button>
                <button
                  onClick={() => setBriefingFor(briefingFor === r.id ? null : r.id)}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50"
                >
                  {briefingFor === r.id ? 'Hide briefing' : 'Preview briefing'}
                </button>
                {r.prepSentAt && <span className="text-[11px] text-green-600">prep emailed</span>}
              </div>

              {r.feedbackHr && (
                <div className="mt-1.5">
                  <div className="text-[11px] font-semibold text-gray-700">Read on the candidate</div>
                  <p className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{r.feedbackHr}</p>
                </div>
              )}
              {fus.length > 0 && (
                <div className="mt-1.5">
                  <div className="text-[11px] font-semibold text-gray-700">Follow up in later rounds</div>
                  <ul className="text-[11px] text-gray-600 list-disc pl-4">
                    {fus.map((f: any, i: number) => (
                      <li key={i}><strong>{followLabel[f.type] ?? 'Follow up'}:</strong> {f.text}</li>
                    ))}
                  </ul>
                </div>
              )}

              {briefingFor === r.id && (
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <div className="text-[11px] font-semibold text-gray-700 mb-1">Briefing this interviewer would receive</div>
                  {briefing.isLoading && <div className="text-[11px] text-gray-400">Loading…</div>}
                  {briefing.data && (briefing.data as any).talkingPoints && (
                    <div className="mb-2 rounded bg-gray-50 border border-gray-100 p-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-gray-700">Company talking points</div>
                      {(briefing.data as any).talkingPoints.whoWeAre && (<p className="text-[11px] text-gray-600 whitespace-pre-wrap">{(briefing.data as any).talkingPoints.whoWeAre}</p>)}
                      {(briefing.data as any).talkingPoints.values.length > 0 && (<div><div className="text-[10px] font-semibold text-gray-500 uppercase">Values</div><ul className="text-[11px] text-gray-600 list-disc pl-4">{(briefing.data as any).talkingPoints.values.map((v: any, i: number) => (<li key={i}><strong>{v.name}</strong>{v.pillar ? ` (${v.pillar})` : ''}{v.description ? `: ${v.description}` : ''}</li>))}</ul></div>)}
                      {(briefing.data as any).talkingPoints.departments.length > 0 && (<div><div className="text-[10px] font-semibold text-gray-500 uppercase">Departments</div><ul className="text-[11px] text-gray-600 list-disc pl-4">{(briefing.data as any).talkingPoints.departments.map((d: any, i: number) => (<li key={i}>{d.name}{d.size ? `: ${d.size}` : ''}</li>))}</ul></div>)}
                    </div>
                  )}
                  {briefing.data && briefing.data.rounds.length === 0 && briefing.data.followUps.length === 0 && (
                    <div className="text-[11px] text-gray-400">No earlier completed rounds yet — nothing to carry forward.</div>
                  )}
                  {briefing.data && briefing.data.rounds.map((b: any, i: number) => (
                    <div key={i} className="mb-1.5">
                      <div className="text-[11px] font-medium text-gray-700">{b.roundName}{b.interviewerName ? ` · ${b.interviewerName}` : ''}</div>
                      <p className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{b.writtenRead}</p>
                    </div>
                  ))}
                  {briefing.data && briefing.data.followUps.length > 0 && (
                    <div className="mt-1">
                      <div className="text-[11px] font-semibold text-blue-700">Follow up in this round</div>
                      <ul className="text-[11px] text-blue-700 list-disc pl-4">
                        {briefing.data.followUps.map((f: any, i: number) => (
                          <li key={i}><strong>{followLabel[f.type] ?? 'Follow up'} ({f.roundName}):</strong> {f.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {briefing.data && (briefing.data.rounds.length > 0 || briefing.data.followUps.length > 0) && (
                    <div className="text-[10px] text-gray-400 mt-1">Scores hidden. Coaching notes for earlier interviewers are not shared.</div>
                  )}
                </div>
              )}
              </div>)}
            </div>
          );
        })}
      </div>

      {(seed.error || add.error || record.error || sendPrep.error) && (
        <div className="text-xs text-red-600 pt-1">{(seed.error || add.error || record.error || sendPrep.error)?.message}</div>
      )}
    </Section>
  );
}

function ScoreBar({ label, score, sub }: { label: string; score: number | null; sub?: string }) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = score == null ? 'bg-gray-300' : pct >= 65 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-gray-600">{score == null ? '\u2014' : `${score}/100`}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded mt-0.5"><div className={`h-1.5 rounded ${color}`} style={{ width: `${pct}%` }} /></div>
      {sub ? <div className="text-xs text-gray-400 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function CombinedScreenSection({ candidateId, existingSummary, onChanged }: { candidateId: string; existingSummary: string | null; onChanged?: () => void }) {
  const [resumeText, setResumeText] = useState('');
  const [needsSponsorship, setNeedsSponsorship] = useState(false);
  const [result, setResult] = useState<any>(null);
  const screen = trpc.candidates.runScreen.useMutation({
    onSuccess: (r) => { setResult(r); onChanged?.(); },
  });

  const req = result?.requirements;
  const nice = result?.niceToHaves;
  const skills = result?.skills;
  const eppScans = result?.eppScans;
  const rec = result?.recommendation;

  return (
    <Section title="Screen - resume, values, skills">
      <div className="text-xs text-gray-500">
        One automated screen for the 200 \u2192 20 gate. It checks the resume against the job's <strong>required</strong> qualifications (missing any, or needing sponsorship, auto-rejects), grades <strong>skills fit</strong> and <strong>values match</strong>, and gives one recommendation. Skills and values inform the call but never reject on their own. Scores are provisional \u2014 calibrate before relying on them.
      </div>

      <textarea
        value={resumeText}
        onChange={(e) => setResumeText(e.target.value)}
        rows={5}
        placeholder="Paste the candidate's resume text here..."
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ls-cyan"
      />
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input type="checkbox" checked={needsSponsorship} onChange={(e) => setNeedsSponsorship(e.target.checked)} />
        Requires international sponsorship (knockout)
      </label>
      <button
        onClick={() => screen.mutate({ id: candidateId, resumeText, needsSponsorship })}
        disabled={!resumeText.trim() || screen.isLoading}
        className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {screen.isLoading ? 'Screening\u2026' : 'Run screen'}
      </button>

      {result && (
        <div className="mt-2 space-y-2">
          {rec === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <div className="text-xs font-semibold text-red-700">Recommend reject{result.movedToStage ? ' \u2014 moved to Rejected' : ''}</div>
              <div className="text-xs text-red-700 mt-0.5">{result.reason}</div>
            </div>
          )}
          {rec === 'advanced' && (
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <div className="text-xs font-semibold text-green-700">
                Recommend advance{result.movedToStage ? ` \u2014 moved to ${result.movedToStage}` : ''} \u00b7 combined {result.composite}/100
              </div>
            </div>
          )}
          {rec === 'review' && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <div className="text-xs font-semibold text-amber-800">Needs human review \u00b7 combined {result.composite}/100</div>
              {result.reason ? <div className="text-xs text-amber-700 mt-0.5">{result.reason}</div> : null}
            </div>
          )}

          <div className="space-y-1.5 border border-gray-100 rounded p-2">
            <ScoreBar label="Requirements" score={req && req.totalCount ? Math.round((req.metCount / req.totalCount) * 100) : null} sub={req ? (req.totalCount ? `${req.metCount}/${req.totalCount} required met` : 'No required qualifications listed') : undefined} />
            <ScoreBar label="Skills fit" score={skills ? skills.score : null} sub={skills && skills.mode === 'keyword' ? 'Keyword fallback \u2014 advisory only' : undefined} />
            <ScoreBar label="EPP match" score={result.eppMatch ?? null} sub={eppScans?.hasEpp ? `avg across ${eppScans.traitCount} EPP traits` : 'No EPP results on file yet'} />
            <ScoreBar label="Company values match" score={result.companyValuesMatch ?? null} sub={eppScans?.hasEpp ? `across ${eppScans.scoredValues} company values` : 'No EPP results on file yet'} />
          </div>

          {req && req.requirements?.length > 0 && (
            <div className="space-y-1">
              {req.requirements.map((r: any, i: number) => (
                <div key={i} className="text-xs flex gap-1.5">
                  <span className={r.met ? 'text-green-600' : 'text-red-600'}>{r.met ? '\u2713' : '\u2717'}</span>
                  <span className="text-gray-700">
                    <span className="font-medium">{r.requirement}</span>
                    {r.evidence ? <span className="text-gray-400 italic"> \u2014 {r.evidence}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {skills && skills.skills?.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="text-xs font-medium text-gray-800">Skills fit detail</div>
              {skills.skills.map((sk: any, i: number) => (
                <div key={i} className="text-xs flex gap-1.5">
                  <span className={sk.rating >= 65 ? 'text-green-600' : sk.rating >= 40 ? 'text-amber-600' : 'text-red-600'}>{sk.rating}</span>
                  <span className="text-gray-700"><span className="font-medium">{sk.skill}</span>{sk.evidence ? <span className="text-gray-400 italic"> \u2014 {sk.evidence}</span> : null}</span>
                </div>
              ))}
            </div>
          )}

          {nice && nice.totalCount > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <div className="text-xs font-medium text-gray-800 mb-1">Nice-to-haves (note only)</div>
              {nice.missing.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="text-xs text-amber-700">Missing (noted for hiring manager, not a dealbreaker):</div>
                  <ul className="list-disc list-inside">
                    {nice.missing.map((m: string, i: number) => (<li key={i} className="text-xs text-amber-700">{m}</li>))}
                  </ul>
                </div>
              ) : (<div className="text-xs text-green-700">All nice-to-haves met.</div>)}
            </div>
          )}
        </div>
      )}

      {!result && existingSummary && (
        <div className="text-xs text-gray-600 whitespace-pre-wrap mt-1">{existingSummary}</div>
      )}
    </Section>
  );
}

function TimelineAlerts() {
  const q = trpc.candidates.timelineAlerts.useQuery(undefined, { refetchInterval: 60000 });
  const a = q.data;
  if (!a) return null;
  const total = a.stalledCandidates.length + a.overdueReqs.length;
  if (total === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-amber-800">Timeline alerts</span>
        <span className="text-xs text-amber-700">{a.stalledCandidates.length} stalled candidate{a.stalledCandidates.length === 1 ? '' : 's'} · {a.overdueReqs.length} overdue req{a.overdueReqs.length === 1 ? '' : 's'}</span>
      </div>
      {a.stalledCandidates.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-amber-800 mb-1">Sitting too long in stage</div>
          <ul className="space-y-0.5">
            {a.stalledCandidates.map((s: any) => (
              <li key={s.candidateId} className="text-xs text-gray-700">
                <span className="font-medium">{s.name}</span>{s.jobTitle ? ` · ${s.jobTitle}` : ''} · {s.stage} · <span className="text-amber-700 font-semibold">{s.daysInStage}d</span> <span className="text-gray-400">(SLA {s.slaDays}d)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.overdueReqs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-amber-800 mb-1">Requisitions past timeline — reassess JD / sourcing / comp</div>
          <ul className="space-y-0.5">
            {a.overdueReqs.map((r: any) => (
              <li key={r.reqId} className="text-xs text-gray-700">
                <span className="font-medium">{r.department}</span> · {r.hiringManager} · <span className="text-amber-700 font-semibold">{r.daysOpen}d open</span> · {r.reasons.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfferSection({ candidateId, onChanged }: { candidateId: string; onChanged?: () => void }) {
  const defaults = trpc.candidates.offerDefaults.useQuery({ id: candidateId });
  const [f, setF] = useState({ jobTitle: '', baseSalary: '', variableComp: '', startDate: '', reportsTo: '', department: '', employmentType: 'Full-Time', location: '' });
  const [clauses, setClauses] = useState<string[]>([]);
  const [addendum, setAddendum] = useState<{ title: string; body: string }[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Prefill from the requisition (intake) once it loads.
  useEffect(() => {
    const d = defaults.data;
    if (!d) return;
    setF({
      jobTitle: d.jobTitle ?? '',
      baseSalary: d.suggestedSalary != null ? String(d.suggestedSalary) : '',
      variableComp: (d as any).variableComp ?? '',
      startDate: d.targetStartDate ?? '',
      reportsTo: d.reportsTo ?? '',
      department: d.department ?? '',
      employmentType: d.employmentType ?? 'Full-Time',
      location: d.location ?? '',
    });
    setClauses((d as any).standardClauses ?? []);
  }, [defaults.data]);

  const d = defaults.data;
  const payload = () => ({
    id: candidateId,
    jobTitle: f.jobTitle || undefined,
    baseSalary: f.baseSalary.trim() ? parseInt(f.baseSalary.replace(/[^0-9]/g, '')) : undefined,
    variableComp: f.variableComp || undefined,
    startDate: f.startDate || undefined,
    reportsTo: f.reportsTo || undefined,
    department: f.department || undefined,
    employmentType: f.employmentType || undefined,
    location: f.location || undefined,
    legalClauses: clauses.length ? clauses : undefined,
    addendum: addendum.filter((a) => a.title.trim() || a.body.trim()),
  });

  const preview = trpc.candidates.offerPreview.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(false); } });
  const send = trpc.candidates.sendOffer.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(true); onChanged?.(); } });
  const esign = trpc.candidates.sendOfferViaAdobeSign.useMutation({ onSuccess: () => onChanged?.() });
  const approvalStatus = trpc.candidates.offerApprovalStatus.useQuery({ candidateId });
  const requestApproval = trpc.candidates.requestOfferApproval.useMutation({ onSuccess: () => { approvalStatus.refetch(); onChanged?.(); } });

  const field = (label: string, key: keyof typeof f, placeholder = '') => (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} placeholder={placeholder}
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
    </div>
  );

  const band = d && (d.bandMin != null || d.bandMax != null)
    ? `$${(d.bandMin ?? d.bandMax)?.toLocaleString()} – $${(d.bandMax ?? d.bandMin)?.toLocaleString()}`
    : null;

  return (
    <Section title="Offer Letter (external)">
      <div className="text-xs text-gray-500">
        Prefilled from the approved intake. Prefilled from the approved intake (title, comp, manager, department, location, dates). Every field and the standard legal language below are editable, so you can fix any mistake before it goes for approval. It is sent to the hiring manager first, who signs off before the candidate is contacted. Custom items go on an addendum. Generated from a fixed template — not AI.
      </div>

      {/* Confirm fields (candidate-specific) */}
      <div className="bg-blue-50 border border-blue-100 rounded p-2 space-y-2">
        <div className="text-xs font-semibold text-blue-800">Confirm for this candidate</div>
        <div>
          <div className="text-xs text-gray-600 mb-0.5">
            Base salary (annual){band ? <span className="text-gray-400"> · approved band {band}{d?.financeConfirmed ? ' · finance ✓' : ''}</span> : null}
          </div>
          <input value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: e.target.value })} placeholder="120000"
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
        </div>
        {field('Start date', 'startDate', 'August 4, 2025')}
        {field('Variable compensation (bonus / commission / equity)', 'variableComp', 'e.g. 15% target bonus')}
      </div>

      {/* From intake (prefilled, editable to override) */}
      <div className="pt-1">
        <div className="text-xs font-medium text-gray-500 mb-1">From intake (edit only to override)</div>
        <div className="grid grid-cols-2 gap-2">
          {field('Position', 'jobTitle')}
          {field('Reports to', 'reportsTo')}
          {field('Department', 'department')}
          {field('Employment type', 'employmentType')}
          {field('Location', 'location')}
        </div>
      </div>

      {/* Editable standard legal language (shows red in the preview = needs counsel review). */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-gray-500">Legal language (standard — edit to fix mistakes)</div>
          <button type="button" onClick={() => setClauses((d as any)?.standardClauses ?? [])}
            className="text-xs text-gray-400 hover:text-ls-primary">Reset to standard</button>
        </div>
        {clauses.map((c, i) => (
          <textarea key={i} value={c} rows={2}
            onChange={(e) => setClauses(clauses.map((x, j) => j === i ? e.target.value : x))}
            className="w-full mb-1 px-2 py-1 border border-gray-300 rounded text-xs" />
        ))}
      </div>

      <div className="pt-1">
        <div className="text-xs text-gray-500 mb-1">Addendum items (custom, optional)</div>
        {addendum.map((a, i) => (
          <div key={i} className="mb-1 space-y-1">
            <input value={a.title} placeholder="Addendum title (e.g. Transition plan)"
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <textarea value={a.body} placeholder="Addendum details" rows={2}
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <button onClick={() => setAddendum(addendum.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-600">Remove addendum</button>
          </div>
        ))}
        <button onClick={() => setAddendum([...addendum, { title: '', body: '' }])}
          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">+ Add addendum</button>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => preview.mutate(payload())} disabled={preview.isLoading}
          className="text-xs px-3 py-1.5 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50">
          {preview.isLoading ? 'Rendering...' : 'Preview letter'}
        </button>
        <button onClick={() => requestApproval.mutate(payload())} disabled={requestApproval.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">
          {requestApproval.isLoading ? 'Sending...' : 'Send to hiring manager for approval'}
        </button>
      </div>
      {approvalStatus.data && (
        <div className={`text-xs mt-1 rounded p-2 border ${approvalStatus.data.status === 'approved' ? 'bg-green-50 border-green-200 text-green-800' : approvalStatus.data.status === 'sent_back' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {approvalStatus.data.status === 'pending' && <>Sent for approval{approvalStatus.data.currentApproverName ? ` — awaiting ${approvalStatus.data.currentApproverName}` : (approvalStatus.data.managerName ? ` (${approvalStatus.data.managerName})` : '')}{approvalStatus.data.totalSteps && approvalStatus.data.totalSteps > 1 ? ` · ${approvalStatus.data.approvedCount}/${approvalStatus.data.totalSteps} approvers signed off` : ''}. The candidate has not been contacted yet - it is waiting in the test inbox for review and sign-off.</>}
          {approvalStatus.data.status === 'approved' && <>Approved{approvalStatus.data.managerName ? ` by ${approvalStatus.data.managerName}` : ''} - the offer has been sent to the candidate.</>}
          {approvalStatus.data.status === 'sent_back' && <>Sent back by the hiring manager{approvalStatus.data.managerNote ? `: "${approvalStatus.data.managerNote}"` : ''}. Fix the offer above and send for approval again.</>}
        </div>
      )}

      {html && (
        <div className="mt-2 border border-gray-200 rounded bg-white max-h-96 overflow-y-auto">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </Section>
  );
}

function InternalOfferSection({ candidateId, onChanged }: { candidateId: string; onChanged?: () => void }) {
  const defaults = trpc.candidates.offerDefaults.useQuery({ id: candidateId });
  // New role (prefilled from intake; editable). Current role (HR-entered).
  const [nw, setNw] = useState({ newTitle: '', newBaseSalary: '', newBonus: '', newManager: '', newDepartment: '', newStipends: '', effectiveDate: '' });
  const [cur, setCur] = useState({ currentTitle: '', currentBaseSalary: '', currentBonus: '', currentManager: '', currentDepartment: '', currentStipends: '' });
  const [addendum, setAddendum] = useState<{ title: string; body: string }[]>([{ title: 'Transition plan', body: '' }]);
  const [html, setHtml] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [clauses, setClauses] = useState<string[]>([]);

  useEffect(() => {
    const d = defaults.data;
    if (!d) return;
    setNw((prev) => ({
      ...prev,
      newTitle: prev.newTitle || (d.jobTitle ?? ''),
      newBaseSalary: prev.newBaseSalary || (d.suggestedSalary != null ? String(d.suggestedSalary) : ''),
      newManager: prev.newManager || (d.reportsTo ?? ''),
      newDepartment: prev.newDepartment || (d.department ?? ''),
    }));
    setClauses((prev) => prev.length ? prev : ((d as any).standardInternalClauses ?? []));
  }, [defaults.data]);

  const d = defaults.data;
  const num = (v: string) => (v.trim() ? parseInt(v.replace(/[^0-9]/g, '')) : undefined);
  const payload = () => ({
    id: candidateId,
    effectiveDate: nw.effectiveDate || undefined,
    newTitle: nw.newTitle || undefined,
    newBaseSalary: num(nw.newBaseSalary),
    newBonus: nw.newBonus || undefined,
    newManager: nw.newManager || undefined,
    newDepartment: nw.newDepartment || undefined,
    newStipends: nw.newStipends || undefined,
    currentTitle: cur.currentTitle || undefined,
    currentBaseSalary: num(cur.currentBaseSalary),
    currentBonus: cur.currentBonus || undefined,
    currentManager: cur.currentManager || undefined,
    currentDepartment: cur.currentDepartment || undefined,
    currentStipends: cur.currentStipends || undefined,
    legalClauses: clauses.length ? clauses : undefined,
    addendum: addendum.filter((a) => a.title.trim() || a.body.trim()),
  });

  const preview = trpc.candidates.internalOfferPreview.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(false); } });
  const send = trpc.candidates.sendInternalOffer.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(true); onChanged?.(); } });
  const esign = trpc.candidates.sendInternalOfferViaAdobeSign.useMutation({ onSuccess: () => onChanged?.() });
  const approvalStatus = trpc.candidates.offerApprovalStatus.useQuery({ candidateId });
  const requestApproval = trpc.candidates.requestInternalOfferApproval.useMutation({ onSuccess: () => { approvalStatus.refetch(); onChanged?.(); } });
  const draftPlan = trpc.candidates.draftTransitionPlan.useMutation({
    onSuccess: (r) => {
      setAddendum((prev) => {
        const idx = prev.findIndex((a) => /transition/i.test(a.title));
        if (idx >= 0) {
          return prev.map((a, j) => (j === idx ? { ...a, body: r.text } : a));
        }
        return [...prev, { title: 'Transition plan', body: r.text }];
      });
    },
  });
  const draftPayload = () => ({
    id: candidateId,
    effectiveDate: nw.effectiveDate || undefined,
    newTitle: nw.newTitle || undefined,
    newManager: nw.newManager || undefined,
    newDepartment: nw.newDepartment || undefined,
    currentTitle: cur.currentTitle || undefined,
    currentManager: cur.currentManager || undefined,
    currentDepartment: cur.currentDepartment || undefined,
  });

  const band = d && (d.bandMin != null || d.bandMax != null)
    ? `$${(d.bandMin ?? d.bandMax)?.toLocaleString()} \u2013 $${(d.bandMax ?? d.bandMin)?.toLocaleString()}`
    : null;

  const twoCol = (label: string, curKey: keyof typeof cur, nwKey: keyof typeof nw, ph = '') => (
    <div className="grid grid-cols-[110px_1fr_1fr] gap-2 items-center">
      <div className="text-xs text-gray-500">{label}</div>
      <input value={cur[curKey]} onChange={(e) => setCur({ ...cur, [curKey]: e.target.value })} placeholder="current"
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
      <input value={nw[nwKey]} onChange={(e) => setNw({ ...nw, [nwKey]: e.target.value })} placeholder={ph || 'new'}
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
    </div>
  );

  return (
    <Section title="Offer Letter (internal move)">
      <div className="text-xs text-gray-500">
        Internal move. The letter shows a <strong>before / now</strong> comparison so the employee sees exactly what changes. The <strong>new role</strong> column is prefilled from the approved intake; the <strong>current</strong> column is entered by HR (HRIS integration pending). Every field and the legal language are editable. Put the transition plan on the addendum. It is sent to the hiring manager for sign-off before the employee is contacted. Generated from a fixed template — not AI.
      </div>

      <div className="grid grid-cols-[110px_1fr_1fr] gap-2 pt-1">
        <div></div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current (before)</div>
        <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">New role (now)</div>
      </div>
      <div className="space-y-1.5">
        {twoCol('Title', 'currentTitle', 'newTitle')}
        {twoCol('Base salary', 'currentBaseSalary', 'newBaseSalary', band ? `band ${band}` : '120000')}
        {twoCol('Bonus ($ or %)', 'currentBonus', 'newBonus', 'e.g. 10% or $15,000')}
        {twoCol('Manager', 'currentManager', 'newManager')}
        {twoCol('Department', 'currentDepartment', 'newDepartment')}
        {twoCol('Stipends', 'currentStipends', 'newStipends')}
      </div>

      <div className="pt-2">
        <div className="text-xs text-gray-500 mb-0.5">Effective date</div>
        <input value={nw.effectiveDate} onChange={(e) => setNw({ ...nw, effectiveDate: e.target.value })} placeholder="August 4, 2025"
          className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
      </div>

      <div className="pt-1">
        <div className="text-xs text-gray-500 mb-1">Addendum items (transition plan, etc.)</div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => draftPlan.mutate(draftPayload())} disabled={draftPlan.isLoading}
            className="text-xs px-2 py-1 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50">
            {draftPlan.isLoading ? 'Drafting\u2026' : '\u2728 Draft transition plan with AI'}
          </button>
          {draftPlan.data && (
            <span className="text-xs text-gray-400">
              {draftPlan.data.mode === 'ai' ? 'AI draft \u2014 review & edit.' : 'Draft (no AI key) \u2014 review & edit.'}
            </span>
          )}
        </div>
        {addendum.map((a, i) => (
          <div key={i} className="mb-1 space-y-1">
            <input value={a.title} placeholder="Addendum title (e.g. Transition plan)"
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <textarea value={a.body} placeholder="Addendum details" rows={2}
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <button onClick={() => setAddendum(addendum.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-600">Remove addendum</button>
          </div>
        ))}
        <button onClick={() => setAddendum([...addendum, { title: '', body: '' }])}
          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">+ Add addendum</button>
      </div>

      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-gray-500">Legal language (standard - edit to fix mistakes)</div>
          <button type="button" onClick={() => setClauses((d as any)?.standardInternalClauses ?? [])}
            className="text-xs text-gray-400 hover:text-ls-primary">Reset to standard</button>
        </div>
        {clauses.map((c, i) => (
          <textarea key={i} value={c} rows={2}
            onChange={(e) => setClauses(clauses.map((x, j) => j === i ? e.target.value : x))}
            className="w-full mb-1 px-2 py-1 border border-gray-300 rounded text-xs" />
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => preview.mutate(payload())} disabled={preview.isLoading}
          className="text-xs px-3 py-1.5 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50">
          {preview.isLoading ? 'Rendering...' : 'Preview letter'}
        </button>
        <button onClick={() => requestApproval.mutate(payload())} disabled={requestApproval.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">
          {requestApproval.isLoading ? 'Sending...' : 'Send to hiring manager for approval'}
        </button>
      </div>
      {approvalStatus.data && (
        <div className={`text-xs mt-1 rounded p-2 border ${approvalStatus.data.status === 'approved' ? 'bg-green-50 border-green-200 text-green-800' : approvalStatus.data.status === 'sent_back' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {approvalStatus.data.status === 'pending' && <>Sent for approval{approvalStatus.data.currentApproverName ? ` — awaiting ${approvalStatus.data.currentApproverName}` : (approvalStatus.data.managerName ? ` (${approvalStatus.data.managerName})` : '')}{approvalStatus.data.totalSteps && approvalStatus.data.totalSteps > 1 ? ` · ${approvalStatus.data.approvedCount}/${approvalStatus.data.totalSteps} approvers signed off` : ''}. The employee has not been contacted yet - it is waiting in the test inbox for review and sign-off.</>}
          {approvalStatus.data.status === 'approved' && <>Approved{approvalStatus.data.managerName ? ` by ${approvalStatus.data.managerName}` : ''} - the internal offer has been sent.</>}
          {approvalStatus.data.status === 'sent_back' && <>Sent back by the hiring manager{approvalStatus.data.managerNote ? `: "${approvalStatus.data.managerNote}"` : ''}. Fix the offer above and send for approval again.</>}
        </div>
      )}

      {html && (
        <div className="mt-2 border border-gray-200 rounded bg-white max-h-96 overflow-y-auto">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </Section>
  );
}

export function PhoneScreenSchedulingSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const status = trpc.scheduling.phoneScreenStatusFor.useQuery({ candidateId: candidate.id });
  const open = trpc.scheduling.openPhoneScreen.useMutation({ onSuccess: () => { status.refetch(); onChanged?.(); } });
  const s = status.data;
  const scheduled = s?.scheduledAt ? new Date(s.scheduledAt) : null;
  return (
    <Section title="Screening call">
      {scheduled ? (
        <div className="text-sm text-green-700 font-medium">Call booked for {scheduled.toLocaleString()}</div>
      ) : s?.opened ? (
        <div className="text-sm text-gray-600 space-y-1">
          <div>Booking link sent. Waiting on the candidate to pick a time.</div>
          {s?.bookingUrl && <div className="text-xs">Candidate link: <a className="text-ls-primary underline" href={s.bookingUrl}>booking page</a></div>}
          {!s?.phoneUrlSet && <div className="text-xs text-amber-600">No Zoom Scheduler link configured yet (set PHONE_SCREEN_SCHEDULING_URL) — the candidate page will say scheduling isn't ready.</div>}
          <button onClick={() => open.mutate({ candidateId: candidate.id })} disabled={open.isLoading} className="mt-1 text-xs text-ls-primary font-medium">Re-send call link</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Emails the candidate a link to book a short phone screen via the Zoom Scheduler (Outlook-connected).
            It's a phone call — they add their number and we call them. No video link is sent.
          </p>
          {!s?.phoneUrlSet && <p className="text-xs text-amber-600">Set PHONE_SCREEN_SCHEDULING_URL to the Zoom Scheduler booking link to go live.</p>}
          <button
            onClick={() => open.mutate({ candidateId: candidate.id })}
            disabled={open.isLoading}
            className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50">
            {open.isLoading ? 'Sending...' : 'Send screening-call link'}
          </button>
        </div>
      )}
      {open.error && <p className="text-sm text-red-600">{open.error.message}</p>}
    </Section>
  );
}

export function SchedulingSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const status = trpc.scheduling.statusFor.useQuery({ candidateId: candidate.id });
  const open = trpc.scheduling.open.useMutation({ onSuccess: () => { status.refetch(); onChanged?.(); } });
  const [calendlyUrl, setCalendlyUrl] = useState('');

  const s = status.data;
  const scheduled = s?.scheduledAt ? new Date(s.scheduledAt) : null;

  return (
    <Section title="Interview Scheduling">
      {scheduled ? (
        <div className="text-sm text-gray-700 space-y-1">
          <div className="font-medium text-green-700">Booked for {scheduled.toLocaleString()}</div>
          {s?.joinUrl && <div className="text-xs">Meeting: <a href={s.joinUrl} className="text-ls-primary underline">join link</a></div>}
          {s?.cancelUrl && <div className="text-xs">Candidate can <a href={s.cancelUrl} className="text-ls-primary underline">reschedule/cancel</a> (Calendly).</div>}
        </div>
      ) : s?.opened ? (
        <div className="text-sm text-gray-600 space-y-1">
          <div>Booking link sent to the candidate. Waiting on them to pick a time in Calendly.</div>
          {s?.bookingUrl && <div className="text-xs">Candidate link: <a className="text-ls-primary underline" href={s.bookingUrl}>booking page</a></div>}
          {s?.schedulingUrl && <div className="text-xs text-gray-400">Calendly: {s.schedulingUrl}</div>}
          {!s?.calendlyConfigured && <div className="text-xs text-amber-600">Calendly webhook key not set — bookings won't record until it's configured on the server.</div>}
          <button onClick={() => open.mutate({ candidateId: candidate.id })} disabled={open.isLoading} className="mt-1 text-xs text-ls-primary font-medium">Re-send booking link</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Emails the candidate a link to book through Calendly. Leave the field blank to use the org default scheduling link, or paste this interviewer's Calendly event URL.
          </p>
          <input
            type="url"
            value={calendlyUrl}
            onChange={(e) => setCalendlyUrl(e.target.value)}
            placeholder="https://calendly.com/… (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          />
          <button
            onClick={() => open.mutate({ candidateId: candidate.id, calendlyUrl: calendlyUrl || undefined })}
            disabled={open.isLoading}
            className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {open.isLoading ? 'Opening…' : 'Open scheduling'}
          </button>
        </div>
      )}
      {open.error && <p className="text-sm text-red-600">{open.error.message}</p>}
    </Section>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2"
      >
        {title}
        <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

export function EditableField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      {editing ? (
        <div className="flex gap-1">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ls-cyan"
          />
          <button onClick={() => { onSave(val); setEditing(false); }} className="text-xs px-2 py-1 bg-ls-primary text-white rounded">Save</button>
          <button onClick={() => { setVal(value); setEditing(false); }} className="text-xs px-2 py-1 text-gray-500">✕</button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-xs text-gray-800 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 min-h-[20px]"
        >
          {value || <span className="text-gray-300 italic">Click to edit</span>}
        </div>
      )}
    </div>
  );
}

function EditableTextarea({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      {editing ? (
        <div>
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            rows={3}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ls-cyan"
          />
          <div className="flex gap-1 mt-1">
            <button onClick={() => { onSave(val); setEditing(false); }} className="text-xs px-2 py-1 bg-ls-primary text-white rounded">Save</button>
            <button onClick={() => { setVal(value); setEditing(false); }} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-xs text-gray-800 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 min-h-[20px] whitespace-pre-wrap"
        >
          {value || <span className="text-gray-300 italic">Click to edit</span>}
        </div>
      )}
    </div>
  );
}
