import { useState } from 'react';
import { Plus, X, Send } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const LIGHTSPEED_VALUES = [
  'Coachable', 'Purposeful', 'Resilient',          // Approach
  'Collaborative', 'Humble', 'Transparent',          // Team
  'Accountable', 'Courageous', 'Creative',
  'Driven', 'Focused', 'High Standards', 'Self-Aware', // Individual
];

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Published: 'bg-green-100 text-green-700',
  Closed: 'bg-red-100 text-red-700',
};

export default function JobDescriptions() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    reqId: '',
    jobTitle: '',
    summary: '',
    responsibilities: '',
    requiredQualifications: '',
    preferredQualifications: '',
    ccatThreshold: 30,
    eppValues: [] as string[],
    workSampleInstructions: '',
  });

  const { data: requisitions } = trpc.requisitions.list.useQuery();
  const { data: jobDescriptions, refetch } = trpc.jobDescriptions.list.useQuery();
  const createMutation = trpc.jobDescriptions.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); resetForm(); },
  });
  const publishMutation = trpc.jobDescriptions.publish.useMutation({
    onSuccess: () => refetch(),
  });

  const resetForm = () => setForm({
    reqId: '', jobTitle: '', summary: '', responsibilities: '',
    requiredQualifications: '', preferredQualifications: '',
    ccatThreshold: 30, eppValues: [], workSampleInstructions: '',
  });

  const toggleValue = (v: string) => {
    setForm((f) => ({
      ...f,
      eppValues: f.eppValues.includes(v)
        ? f.eppValues.filter((x) => x !== v)
        : [...f.eppValues, v],
    }));
  };

  const getReqLabel = (reqId: string) => {
    const r = (requisitions ?? []).find((r) => r.id === reqId);
    return r ? `${r.department} · ${r.hiringManager}` : reqId;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Descriptions</h1>
          <p className="text-gray-500 text-sm mt-1">Define roles, CCAT thresholds, and EPP value targets</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          <Plus size={16} />
          New Job Description
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">New Job Description</span>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Requisition *</label>
              <select
                value={form.reqId}
                onChange={(e) => setForm({ ...form, reqId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Select requisition</option>
                {(requisitions ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.department} — {r.hiringManager}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Title *</label>
              <input
                type="text"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Summary</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={2}
                placeholder="Brief overview of the role..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsibilities</label>
              <textarea
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
                rows={3}
                placeholder="Key responsibilities..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Required Qualifications</label>
              <textarea
                value={form.requiredQualifications}
                onChange={(e) => setForm({ ...form, requiredQualifications: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preferred Qualifications</label>
              <textarea
                value={form.preferredQualifications}
                onChange={(e) => setForm({ ...form, preferredQualifications: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                CCAT Threshold <span className="text-gray-400 font-normal">(pass score, default 30)</span>
              </label>
              <input
                type="number" min={0} max={50}
                value={form.ccatThreshold}
                onChange={(e) => setForm({ ...form, ccatThreshold: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Work Sample Instructions</label>
              <textarea
                value={form.workSampleInstructions}
                onChange={(e) => setForm({ ...form, workSampleInstructions: e.target.value })}
                rows={3}
                placeholder="Instructions sent to candidates for the work sample..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                EPP Values to match <span className="text-gray-400 font-normal">(select which Lightspeed values matter most for this role)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {LIGHTSPEED_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleValue(v)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      form.eppValues.includes(v)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.reqId || !form.jobTitle || createMutation.isLoading}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {createMutation.isLoading ? 'Creating...' : 'Save as Draft'}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-600 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!jobDescriptions || jobDescriptions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No job descriptions yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Job Title</th>
                <th className="px-4 py-3">Requisition</th>
                <th className="px-4 py-3">CCAT Threshold</th>
                <th className="px-4 py-3">EPP Values</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {jobDescriptions.map((jd) => (
                <tr key={jd.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{jd.jobTitle}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{getReqLabel(jd.reqId)}</td>
                  <td className="px-4 py-3 text-gray-600">{jd.ccatThreshold}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {Array.isArray(jd.eppValues) && (jd.eppValues as string[]).length > 0
                      ? (jd.eppValues as string[]).slice(0, 3).join(', ') + ((jd.eppValues as string[]).length > 3 ? ` +${(jd.eppValues as string[]).length - 3}` : '')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[jd.status] ?? ''}`}>
                      {jd.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {jd.publishedAt ? new Date(jd.publishedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {jd.status === 'Draft' && (
                      <button
                        onClick={() => publishMutation.mutate({ id: jd.id })}
                        disabled={publishMutation.isLoading}
                        className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                        title="Publish"
                      >
                        <Send size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
