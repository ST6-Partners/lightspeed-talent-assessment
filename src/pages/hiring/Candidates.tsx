import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, ChevronRight, ChevronLeft, Ban, ChevronDown, Trash2 } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STAGES = [
  'Applied', 'Assessment', 'Values Review', 'Work Sample',
  'Interview Scheduled', 'Interviewed', 'Offered', 'Hired', 'Rejected',
] as const;

const STAGE_COLORS: Record<string, string> = {
  Applied: 'bg-purple-100 text-purple-700',
  Assessment: 'bg-blue-100 text-blue-700',
  'Work Sample': 'bg-indigo-100 text-indigo-700',
  'Values Review': 'bg-cyan-100 text-cyan-700',
  'Interview Scheduled': 'bg-yellow-100 text-yellow-700',
  Interviewed: 'bg-orange-100 text-orange-700',
  Offered: 'bg-emerald-100 text-emerald-700',
  Hired: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

type Stage = typeof STAGES[number];

export default function Candidates() {
  const [showForm, setShowForm] = useState(false);
  const [stageFilter, setStageFilter] = useState<Stage | ''>('');
  const [internalFilter, setInternalFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link support: /hiring/candidates?candidate=<id> preselects that candidate.
  useEffect(() => {
    const c = searchParams.get('candidate');
    if (c) { setSelectedId(c); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showRejected, setShowRejected] = useState(false);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
    needsSponsorship: false,
    isInternal: false,
    internalEmployee: '',
  });

  const { data: candidates, refetch } = trpc.candidates.list.useQuery(
    stageFilter ? { stage: stageFilter } : undefined
  );
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();

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
    onSuccess: () => refetch(),
  });
  const workSampleReviewMutation = trpc.workSample.setReview.useMutation({
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

  const getPrevStage = (current: Stage): Stage | null => {
    const idx = STAGES.indexOf(current);
    if (idx <= 0 || current === 'Rejected') return null;
    return STAGES[idx - 1];
  };
  const getNextStage = (current: Stage): Stage | null => {
    const idx = STAGES.indexOf(current);
    const next = STAGES[idx + 1];
    if (!next || next === 'Rejected') return null;
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

        {/* Stage filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setStageFilter('')}
            className={`px-3 py-1 text-xs rounded-full border ${!stageFilter ? 'bg-ls-primary text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
          >
            All
          </button>
          {STAGES.filter((s) => s !== 'Rejected').map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${stageFilter === s ? 'bg-ls-primary text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
            >
              {s}
            </button>
          ))}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                <select value={form.jdId} onChange={(e) => setForm({ ...form, jdId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">— Not linked yet —</option>
                  {(jobDescriptions ?? []).map((j) => (
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

        <div className="bg-white rounded-lg border border-gray-200">
          {!candidates || candidates.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No candidates found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">CCAT</th>
                  <th className="px-4 py-3">EPP Match</th>
                  <th className="px-4 py-3">Values Match</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.filter((c: any) => (internalFilter === 'all' || (internalFilter === 'internal' ? c.isInternal : !c.isInternal)) && c.currentStage !== 'Rejected').map((c) => {
                  const nextStage = getNextStage(c.currentStage as Stage);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                      className={`border-b border-gray-50 text-sm cursor-pointer transition-colors ${selectedId === c.id ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}{(c as any).isInternal && <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 align-middle">Internal</span>}</td>
                      <td className="px-4 py-3 text-gray-500">{c.email}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{getJdTitle(c.jdId ?? null)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_COLORS[c.currentStage] ?? ''}`}>
                          {c.currentStage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.ccatScore ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {c.eppValuesMatchScore != null ? `${c.eppValuesMatchScore}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {(c as any).companyValuesMatchScore != null ? `${(c as any).companyValuesMatchScore}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {getPrevStage(c.currentStage as Stage) && (
                            <button
                              onClick={() => advanceMutation.mutate({ id: c.id, toStage: getPrevStage(c.currentStage as Stage)! })}
                              disabled={advanceMutation.isLoading}
                              className="p-1 text-gray-400 hover:text-amber-600 transition-colors"
                              title={`Move back to ${getPrevStage(c.currentStage as Stage)}`}
                            >
                              <ChevronLeft size={16} />
                            </button>
                          )}
                          {nextStage && (
                            <button
                              onClick={() => advanceMutation.mutate({ id: c.id, toStage: nextStage })}
                              disabled={advanceMutation.isLoading}
                              className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                              title={`Advance to ${nextStage}`}
                            >
                              <ChevronRight size={16} />
                            </button>
                          )}
                          {c.currentStage !== 'Rejected' && c.currentStage !== 'Hired' && (
                            <button
                              onClick={() => setRejectingId(c.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Reject"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => doDelete(c.id)}
                            disabled={deleteMutation.isLoading}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete (build tool)"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Rejected candidates — collapsed, out of the main pipeline */}
        {(candidates ?? []).filter((c: any) => c.currentStage === 'Rejected' && (internalFilter === 'all' || (internalFilter === 'internal' ? c.isInternal : !c.isInternal))).length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowRejected(!showRejected)}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2 hover:text-gray-700"
            >
              <ChevronDown size={16} className={showRejected ? '' : '-rotate-90'} />
              Rejected ({(candidates ?? []).filter((c: any) => c.currentStage === 'Rejected' && (internalFilter === 'all' || (internalFilter === 'internal' ? c.isInternal : !c.isInternal))).length})
            </button>
            {showRejected && (
              <div className="bg-white rounded-lg border border-gray-200">
                <table className="w-full">
                  <tbody>
                    {(candidates ?? []).filter((c: any) => c.currentStage === 'Rejected' && (internalFilter === 'all' || (internalFilter === 'internal' ? c.isInternal : !c.isInternal))).map((c: any) => (
                      <tr key={c.id} className="border-b border-gray-50 text-sm">
                        <td className="px-4 py-2 font-medium text-gray-700">{c.firstName} {c.lastName}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{c.email}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{getJdTitle(c.jdId ?? null)}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{c.rejectionReason ?? ''}</td>
                        <td className="px-4 py-2 text-right">
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
              { label: 'Values Match', value: (selected as any).companyValuesMatchScore != null ? `${(selected as any).companyValuesMatchScore}%` : null },
              { label: 'Work Sample', value: selected.workSampleScore },
              { label: 'Resume Review', value: selected.resumeReviewScore },
              { label: 'Reference Check', value: selected.referenceCheckScore },
              { label: 'Interview Score', value: (selected as any).interviewScore },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded p-2">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-sm font-medium text-gray-900">{value ?? '—'}</div>
              </div>
            ))}
          </div>

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
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic">No submission yet.</div>
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
                      onClick={() => navigator.clipboard?.writeText(sendWorkSampleMutation.data!.url)}
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

          {/* Interviewer */}
          <Section title="Interviewer">
            <EditableField
              label="Name"
              value={(selected as any).interviewerName ?? ''}
              onSave={(v) => saveNotes(selected.id, 'interviewerName', v)}
            />
            <EditableField
              label="Email"
              value={(selected as any).interviewerEmail ?? ''}
              onSave={(v) => saveNotes(selected.id, 'interviewerEmail', v)}
            />
            <EditableField
              label="Zoom Meeting ID"
              value={(selected as any).zoomMeetingId ?? ''}
              onSave={(v) => saveNotes(selected.id, 'zoomMeetingId', v)}
            />
          </Section>

          {/* Interview scheduling — availability request + candidate self-booking */}
          <SchedulingSection key={`sched-${selected.id}`} candidate={selected} onChanged={refetch} />

          {/* Resume screen — checks resume vs REQUIRED qualifications only */}
          {/* Internal candidate handling */}
          <InternalSection key={`int-${selected.id}`} candidate={selected} onChanged={refetch} />

          <CombinedScreenSection key={selected.id} candidateId={selected.id} existingSummary={(selected as any).screenSummary ?? null} onChanged={refetch} />

          {/* Reference check — agent report (after interview, before offer) */}
          <ReferenceCheckSection key={`ref-${selected.id}`} candidateId={selected.id} existingNotes={(selected as any).referenceCheckNotes ?? null} onChanged={refetch} />

          {/* Offer letter — internal moves get a before/now comparison; external gets the standard letter */}
          {(selected as any).isInternal
            ? <InternalOfferSection key={`ioffer-${selected.id}`} candidateId={selected.id} onChanged={refetch} />
            : <OfferSection key={`offer-${selected.id}`} candidateId={selected.id} onChanged={refetch} />}

          {/* HR notes */}
          <Section title="HR Notes">
            <EditableTextarea
              label="Resume Review Notes"
              value={(selected as any).resumeReviewNotes ?? ''}
              onSave={(v) => saveNotes(selected.id, 'resumeReviewNotes', v)}
            />
            <EditableTextarea
              label="Reference Check Notes"
              value={(selected as any).referenceCheckNotes ?? ''}
              onSave={(v) => saveNotes(selected.id, 'referenceCheckNotes', v)}
            />
            <EditableTextarea
              label="Values Match Notes"
              value={(selected as any).valuesMatchNotes ?? ''}
              onSave={(v) => saveNotes(selected.id, 'valuesMatchNotes', v)}
            />
            <EditableTextarea
              label="General Notes"
              value={selected.notes ?? ''}
              onSave={(v) => saveNotes(selected.id, 'notes', v)}
            />
          </Section>

          {/* Interview questions (read-only, AI-generated) */}
          {(selected as any).interviewQuestions && (
            <Section title="Interview Questions (AI-generated)">
              <div className="space-y-2">
                {((selected as any).interviewQuestions as any[]).map((q: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                    <div className="font-medium text-gray-700">{q.category}</div>
                    <div className="text-gray-600 mt-0.5">{q.question}</div>
                    {q.rationale && <div className="text-gray-400 mt-0.5 italic">{q.rationale}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Interview transcript -> feedback (candidate, HR, interviewer) + email */}
          <InterviewFeedbackSection key={`ivf-${selected.id}`} candidate={selected} onChanged={refetch} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function InterviewFeedbackSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
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
    <Section title="Screen \u2014 resume \u00b7 skills \u00b7 values">
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

function ReferenceCheckSection({ candidateId, existingNotes, onChanged }: { candidateId: string; existingNotes: string | null; onChanged?: () => void }) {
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', relationship: '' });

  const refsQuery = trpc.references.list.useQuery({ candidateId });
  const addRef = trpc.references.add.useMutation({ onSuccess: () => { setForm({ name: '', email: '', relationship: '' }); refsQuery.refetch(); } });
  const removeRef = trpc.references.remove.useMutation({ onSuccess: () => refsQuery.refetch() });
  const sendReqs = trpc.references.sendRequests.useMutation({ onSuccess: () => refsQuery.refetch() });
  const run = trpc.candidates.referenceCheck.useMutation({ onSuccess: (r) => { setResult(r); onChanged?.(); } });

  const refs = refsQuery.data ?? [];
  const responded = refs.filter((r: any) => r.status === 'responded').length;

  const recLabel: Record<string, string> = { proceed: 'Proceed', proceed_with_caution: 'Proceed with caution', flag_for_review: 'Flag for review' };
  const recColor: Record<string, string> = {
    proceed: 'text-green-700 bg-green-50 border-green-200',
    proceed_with_caution: 'text-amber-700 bg-amber-50 border-amber-200',
    flag_for_review: 'text-red-700 bg-red-50 border-red-200',
  };
  const statusColor: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600', requested: 'bg-blue-100 text-blue-700', responded: 'bg-green-100 text-green-700',
  };

  return (
    <Section title="Reference Check (finalists)">
      <div className="text-xs text-gray-500">
        Run at the finalist stage. Add the references the candidate provided, email them a short questionnaire, then summarize the replies into a red-flags / positives report. Informational — it does not reject the candidate.
      </div>

      {/* Reference list */}
      <div className="space-y-1">
        {refs.length === 0 && <div className="text-xs text-gray-400 italic">No references added yet.</div>}
        {refs.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded p-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-800 truncate">{r.name} <span className="text-gray-400 font-normal">{r.relationship ? `· ${r.relationship}` : ''}</span></div>
              <div className="text-xs text-gray-500 truncate">{r.email}</div>
              {r.status === 'responded' && r.response && (
                <div className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">
                  {r.wouldRehire ? <span className="font-medium">Would rehire: {r.wouldRehire}. </span> : null}{r.response}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColor[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
              <button onClick={() => removeRef.mutate({ id: r.id })} className="text-xs text-gray-400 hover:text-red-600">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add a reference */}
      <div className="grid grid-cols-3 gap-1">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name"
          className="px-2 py-1 border border-gray-300 rounded text-xs" />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email"
          className="px-2 py-1 border border-gray-300 rounded text-xs" />
        <input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Relationship"
          className="px-2 py-1 border border-gray-300 rounded text-xs" />
      </div>
      <button
        onClick={() => addRef.mutate({ candidateId, name: form.name, email: form.email, relationship: form.relationship || undefined })}
        disabled={!form.name.trim() || !form.email.trim() || addRef.isLoading}
        className="text-xs px-3 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        + Add reference
      </button>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => sendReqs.mutate({ candidateId })}
          disabled={refs.length === 0 || sendReqs.isLoading}
          className="text-xs px-3 py-1.5 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50"
        >
          {sendReqs.isLoading ? 'Sending…' : 'Email reference requests'}
        </button>
        <button
          onClick={() => run.mutate({ id: candidateId })}
          disabled={run.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {run.isLoading ? 'Summarizing…' : 'Summarize references'}
        </button>
      </div>
      {sendReqs.data && <div className="text-xs text-gray-500">Sent {sendReqs.data.sent} request(s).</div>}
      <div className="text-xs text-gray-400">{responded}/{refs.length} references responded.</div>

      {/* Summary */}
      {result && (
        <div className="mt-1 space-y-2">
          <div className={`text-xs font-semibold rounded border p-2 ${recColor[result.recommendation] ?? 'text-gray-700 bg-gray-50 border-gray-200'}`}>
            {recLabel[result.recommendation] ?? result.recommendation} · confidence {result.confidence}
            {result.mode === 'placeholder' ? ' · AI draft (no reference responses yet)' : ' · AI draft — verify'}
          </div>
          {result.summary && <div className="text-xs text-gray-700">{result.summary}</div>}
          {result.positives?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-700 mb-0.5">Positive signals</div>
              <ul className="list-disc list-inside">{result.positives.map((x: string, i: number) => <li key={i} className="text-xs text-green-700">{x}</li>)}</ul>
            </div>
          )}
          {result.concerns?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-amber-700 mb-0.5">Concerns</div>
              <ul className="list-disc list-inside">{result.concerns.map((x: string, i: number) => <li key={i} className="text-xs text-amber-700">{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!result && existingNotes && (
        <div className="text-xs text-gray-600 whitespace-pre-wrap mt-1">{existingNotes}</div>
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
          {approvalStatus.data.status === 'pending' && <>Sent to the hiring manager for approval{approvalStatus.data.managerName ? ` (${approvalStatus.data.managerName})` : ''}. The candidate has not been contacted yet - it is waiting in the test inbox for review and sign-off.</>}
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
          {approvalStatus.data.status === 'pending' && <>Sent to the hiring manager for approval{approvalStatus.data.managerName ? ` (${approvalStatus.data.managerName})` : ''}. The employee has not been contacted yet - it is waiting in the test inbox for review and sign-off.</>}
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

function InternalSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const [emp, setEmp] = useState(candidate.internalEmployee ?? '');
  const [chain, setChain] = useState(candidate.leadershipAwareness ?? '');
  const upd = trpc.candidates.update.useMutation({ onSuccess: () => onChanged?.() });
  const notify = trpc.candidates.notifyLeadership.useMutation();
  const isInternal = !!candidate.isInternal;

  return (
    <Section title="Internal Candidate">
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={isInternal}
          onChange={(e) => upd.mutate({ id: candidate.id, isInternal: e.target.checked })} />
        This is an internal candidate (current employee)
      </label>

      {isInternal && (
        <div className="space-y-2 mt-1">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Current role at Lightspeed</div>
            <div className="flex gap-1">
              <input value={emp} onChange={(e) => setEmp(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs" />
              <button onClick={() => upd.mutate({ id: candidate.id, internalEmployee: emp })} className="text-xs px-2 py-1 bg-ls-primary text-white rounded">Save</button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={!!candidate.managerAware}
              onChange={(e) => upd.mutate({ id: candidate.id, managerAware: e.target.checked })} />
            Their current manager knows they applied
          </label>

          <div>
            <div className="text-xs text-gray-500 mb-0.5">This candidate\u2019s leadership chain (comma-separated) — notified so no one is blindsided</div>
            <textarea value={chain} onChange={(e) => setChain(e.target.value)} rows={2}
              placeholder="manager@…, skip-level@…, elt@…"
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <div className="flex gap-2 mt-1">
              <button onClick={() => upd.mutate({ id: candidate.id, leadershipAwareness: chain })} className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-700">Save list</button>
              <button onClick={() => notify.mutate({ id: candidate.id })} disabled={notify.isLoading}
                className="text-xs px-2 py-1 bg-ls-primary text-white rounded disabled:opacity-50">
                {notify.isLoading ? 'Notifying…' : 'Notify leadership'}
              </button>
            </div>
            {notify.data && <div className="text-xs text-gray-500 mt-1">Notified {notify.data.sent} recipient(s).{(notify.data as any).reason ? ` ${(notify.data as any).reason}` : ''}</div>}
            <div className="text-xs text-gray-400 mt-1">Manual list for now; automatic org-chart notification arrives with HRIS access.</div>
          </div>
        </div>
      )}
    </Section>
  );
}

function SchedulingSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
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

function EditableField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
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
