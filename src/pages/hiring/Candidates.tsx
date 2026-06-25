import { useState } from 'react';
import { Plus, X, ChevronRight, Ban } from 'lucide-react';
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
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
  });

  const { data: candidates, refetch } = trpc.candidates.list.useQuery(
    stageFilter ? { stage: stageFilter } : undefined
  );
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();
  const createMutation = trpc.candidates.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); resetForm(); },
  });
  const advanceMutation = trpc.candidates.advanceStage.useMutation({
    onSuccess: () => { refetch(); setAdvancingId(null); },
  });
  const rejectMutation = trpc.candidates.reject.useMutation({
    onSuccess: () => { refetch(); setRejectingId(null); setRejectReason(''); },
  });

  const resetForm = () => setForm({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', source: '', notes: '',
  });

  const getNextStage = (current: Stage): Stage | null => {
    const idx = STAGES.indexOf(current);
    // Skip Rejected when advancing
    const next = STAGES[idx + 1];
    if (!next || next === 'Rejected') return null;
    return next;
  };

  const getJdTitle = (jdId: string | null) => {
    if (!jdId) return '—';
    return (jobDescriptions ?? []).find((j) => j.id === jdId)?.jobTitle ?? '—';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-gray-500 text-sm mt-1">Track every applicant through the pipeline</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Candidate
        </button>
      </div>

      {/* Stage filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setStageFilter('')}
          className={`px-3 py-1 text-xs rounded-full border ${!stageFilter ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
        >
          All
        </button>
        {STAGES.filter((s) => s !== 'Rejected').map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${stageFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
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
              <input
                type="text" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
              <input
                type="text" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input
                type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
              <select
                value={form.jdId}
                onChange={(e) => setForm({ ...form, jdId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">— Not linked yet —</option>
                {(jobDescriptions ?? []).map((j) => (
                  <option key={j.id} value={j.id}>{j.jobTitle}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Select source</option>
                {['LinkedIn', 'Indeed', 'Referral', 'Company Website', 'Recruiter', 'Other'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
              <input
                type="url" value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Resume URL</label>
              <input
                type="url" value={form.resumeUrl}
                onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => createMutation.mutate({ ...form, jdId: form.jdId || undefined })}
              disabled={!form.firstName || !form.lastName || !form.email || createMutation.isLoading}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {createMutation.isLoading ? 'Adding...' : 'Add Candidate'}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-600 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-200 p-5 w-96">
            <div className="text-sm font-semibold text-gray-700 mb-3">Reject Candidate</div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. CCAT score below threshold, not the right fit..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
                disabled={!rejectReason || rejectMutation.isLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isLoading ? 'Rejecting...' : 'Reject'}
              </button>
              <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-4 py-2 text-gray-600 text-sm">
                Cancel
              </button>
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
                <th className="px-4 py-3 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const nextStage = getNextStage(c.currentStage as Stage);
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
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
                    <td className="px-4 py-3">
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
  );
}
