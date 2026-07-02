import { useState } from 'react';
import { Plus, X, ChevronRight, Ban, ChevronDown } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STAGES = [
  'Applied', 'Assessment', 'Work Sample', 'Values Review',
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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
    needsSponsorship: false,
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

  const resetForm = () => setForm({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
    needsSponsorship: false,
  });

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
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const nextStage = getNextStage(c.currentStage as Stage);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                      className={`border-b border-gray-50 text-sm cursor-pointer transition-colors ${selectedId === c.id ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
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
                      <td className="px-4 py-3 text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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

          {/* Resume screen — checks resume vs REQUIRED qualifications only */}
          <ResumeScreenSection key={selected.id} candidateId={selected.id} existingNotes={(selected as any).resumeReviewNotes ?? null} onChanged={refetch} />

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

          {/* Post-interview feedback (read-only, AI-generated) */}
          {(selected as any).interviewFeedbackHr && (
            <Section title="Interview Feedback — HR">
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{(selected as any).interviewFeedbackHr}</p>
            </Section>
          )}
          {(selected as any).interviewFeedbackCandidate && (
            <Section title="Interview Feedback — Candidate">
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{(selected as any).interviewFeedbackCandidate}</p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function ResumeScreenSection({ candidateId, existingNotes, onChanged }: { candidateId: string; existingNotes: string | null; onChanged?: () => void }) {
  const [resumeText, setResumeText] = useState('');
  const [needsSponsorship, setNeedsSponsorship] = useState(false);
  const [result, setResult] = useState<any>(null);
  const screen = trpc.candidates.screenResume.useMutation({
    onSuccess: (r) => { setResult(r); onChanged?.(); },
  });

  const req = result?.requirements;
  const nice = result?.niceToHaves;

  return (
    <Section title="Resume Screen (requirements gate)">
      <div className="text-xs text-gray-500">
        Checks the resume against the job's <strong>required</strong> qualifications. Missing a requirement (or needing sponsorship) auto-rejects; all met moves the candidate forward. <strong>Nice-to-haves</strong> never reject — they just leave a note for the hiring manager.
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={needsSponsorship}
          onChange={(e) => setNeedsSponsorship(e.target.checked)}
        />
        Candidate requires international sponsorship (auto-decline)
      </label>

      <textarea
        value={resumeText}
        onChange={(e) => setResumeText(e.target.value)}
        rows={5}
        placeholder="Paste the candidate's resume text here..."
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ls-cyan"
      />
      <button
        onClick={() => screen.mutate({ id: candidateId, resumeText, needsSponsorship })}
        disabled={(!resumeText.trim() && !needsSponsorship) || screen.isLoading}
        className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {screen.isLoading ? 'Screening…' : 'Screen resume'}
      </button>

      {result && (
        <div className="mt-2 space-y-2">
          {/* Decision banner */}
          {result.decision === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <div className="text-xs font-semibold text-red-700">Auto-rejected</div>
              <div className="text-xs text-red-700 mt-0.5">{result.reason}</div>
            </div>
          )}
          {result.decision === 'advanced' && (
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <div className="text-xs font-semibold text-green-700">
                Passed — moved forward{result.movedToStage ? ` to ${result.movedToStage}` : ''}
              </div>
            </div>
          )}
          {result.decision === 'flagged' && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2">
              <div className="text-xs font-semibold text-gray-700">Screen recorded (no stage change)</div>
              {result.reason ? <div className="text-xs text-gray-600 mt-0.5">{result.reason}</div> : null}
            </div>
          )}

          {/* Requirements (must-haves) */}
          {req && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-800">
                {req.totalCount === 0
                  ? 'No required qualifications listed on this job description.'
                  : `Requirements: ${req.metCount}/${req.totalCount} met`}
              </div>
              {req.requirements?.map((r: any, i: number) => (
                <div key={i} className="text-xs flex gap-1.5">
                  <span className={r.met ? 'text-green-600' : 'text-red-600'}>{r.met ? '✓' : '✗'}</span>
                  <span className="text-gray-700">
                    <span className="font-medium">{r.requirement}</span>
                    {r.evidence ? <span className="text-gray-400 italic"> — {r.evidence}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Nice-to-haves (never reject) */}
          {nice && nice.totalCount > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <div className="text-xs font-medium text-gray-800 mb-1">Nice-to-haves (note only)</div>
              {nice.missing.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="text-xs text-amber-700">Missing (noted for hiring manager, not a dealbreaker):</div>
                  <ul className="list-disc list-inside">
                    {nice.missing.map((m: string, i: number) => (
                      <li key={i} className="text-xs text-amber-700">{m}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-xs text-green-700">All nice-to-haves met.</div>
              )}
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
