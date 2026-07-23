import { useState } from 'react';
import { Plus, X, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
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

const EMPTY_FORM = {
  reqId: '',
  jobTitle: '',
  summary: '',
  responsibilities: '',
  requiredQualifications: '',
  preferredQualifications: '',
  eppValues: [] as string[],
  workSampleUploadUrl: '',
  workSampleUploadName: '',
  workSampleRequired: false,
};

// A JD is "live/Published" once approved; only an intake-generated JD still
// awaiting approval (pendingReview) reads "Draft". Closed stays Closed.
function jdStatus(jd: any): 'Draft' | 'Published' | 'Closed' {
  if (jd.status === 'Closed') return 'Closed';
  return (jd as any).pendingReview ? 'Draft' : 'Published';
}

export default function JobDescriptions() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data: requisitions } = trpc.requisitions.list.useQuery();
  const { data: jobDescriptions, refetch } = trpc.jobDescriptions.list.useQuery();
  const { data: jdQuestions } = trpc.intake.questionsForReq.useQuery({ reqId: form.reqId }, { enabled: !!editingId && !!form.reqId });
  const [uploadingWorkSample, setUploadingWorkSample] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleWorkSampleUpload = async (file: File) => {
    setUploadError(null);
    setUploadingWorkSample(true);
    try {
      const buffer = await file.arrayBuffer();
      const resp = await fetch('/api/upload/work-sample', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          // Header values must be Latin-1; encode so non-ASCII filenames work.
          'x-filename': encodeURIComponent(file.name),
        },
        body: buffer,
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        setUploadError(result.error || 'Upload failed');
        return;
      }
      setForm((f) => ({ ...f, workSampleUploadUrl: result.url, workSampleUploadName: file.name }));
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploadingWorkSample(false);
    }
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); resetForm(); };

  const createMutation = trpc.jobDescriptions.create.useMutation({
    onSuccess: () => { refetch(); closeForm(); },
  });
  const updateMutation = trpc.jobDescriptions.update.useMutation({
    onSuccess: () => { refetch(); closeForm(); },
  });
  const approveReviewMutation = trpc.jobDescriptions.approveReview.useMutation({
    onSuccess: () => refetch(),
  });
  const deleteMutation = trpc.jobDescriptions.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const resetForm = () => setForm({ ...EMPTY_FORM, eppValues: [] });

  const startCreate = () => {
    setEditingId(null);
    resetForm();
    setShowForm(true);
  };

  const startEdit = (jd: any) => {
    setEditingId(jd.id);
    setForm({
      reqId: jd.reqId ?? '',
      jobTitle: jd.jobTitle ?? '',
      summary: jd.summary ?? '',
      responsibilities: jd.responsibilities ?? '',
      requiredQualifications: jd.requiredQualifications ?? '',
      preferredQualifications: jd.preferredQualifications ?? '',
      eppValues: Array.isArray(jd.eppValues) ? (jd.eppValues as string[]) : [],
      workSampleUploadUrl: jd.workSampleUploadUrl ?? '',
      workSampleUploadName: jd.workSampleUploadName ?? '',
      workSampleRequired: jd.workSampleRequired ?? false,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.reqId || !form.jobTitle) return;
    const payload = { ...form };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  const handleDelete = (jd: any) => {
    deleteMutation.mutate({ id: jd.id });
  };

  const toggleValue = (v: string) => {
    setForm((f) => ({
      ...f,
      eppValues: f.eppValues.includes(v)
        ? f.eppValues.filter((x) => x !== v)
        : [...f.eppValues, v],
    }));
  };

  const getReqDept = (reqId: string) => {
    const r = (requisitions ?? []).find((x: any) => x.id === reqId);
    return r?.department ?? '—';
  };
  const getReqLabel = (reqId: string) => {
    const r = (requisitions ?? []).find((r) => r.id === reqId);
    return r ? `${r.department} · ${r.hiringManager}` : reqId;
  };

  const saving = createMutation.isLoading || updateMutation.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Descriptions</h1>
          <p className="text-gray-500 text-sm mt-1">Define roles and EPP value targets</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : startCreate())}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          New Job Description
        </button>
      </div>


      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">
              {editingId ? 'Edit Job Description' : 'New Job Description'}
            </span>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Requisition *</label>
              <select
                value={form.reqId}
                onChange={(e) => setForm({ ...form, reqId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Summary</label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={2}
                placeholder="Brief overview of the role..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsibilities</label>
              <textarea
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
                rows={3}
                placeholder="Key responsibilities..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Required Qualifications</label>
              <textarea
                value={form.requiredQualifications}
                onChange={(e) => setForm({ ...form, requiredQualifications: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preferred Qualifications</label>
              <textarea
                value={form.preferredQualifications}
                onChange={(e) => setForm({ ...form, preferredQualifications: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Work Sample</label>
              {form.workSampleUploadUrl ? (
                <div className="flex items-center justify-between gap-3 px-3 py-2 border border-gray-300 rounded-md text-sm">
                  <a href={form.workSampleUploadUrl} target="_blank" rel="noreferrer" className="text-ls-primary hover:underline truncate">
                    {form.workSampleUploadName || 'Uploaded work sample'}
                  </a>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, workSampleUploadUrl: '', workSampleUploadName: '' })}
                    className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm cursor-pointer hover:border-gray-500 ${uploadingWorkSample ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Plus size={14} className="text-gray-400" />
                  <span className="text-gray-600">{uploadingWorkSample ? 'Uploading…' : 'Upload a work sample'}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWorkSampleUpload(f); e.target.value = ''; }}
                  />
                </label>
              )}
              {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
              <p className="text-xs text-gray-400 mt-1">Optional placeholder — attach a work sample file for this role. (Built-in work sample tasks are paused.)</p>
              <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
                <input type="checkbox" checked={form.workSampleRequired}
                  onChange={(e) => setForm({ ...form, workSampleRequired: e.target.checked })}
                  className="rounded border-gray-300 text-ls-primary focus:ring-ls-cyan" />
                Include a work sample step for this role
              </label>
              <p className="text-xs text-gray-400 mt-1">Optional. When on, candidates go through the work sample after the team interview, before the reference check. When off, the step is skipped.</p>
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
                        ? 'bg-ls-primary text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {editingId && jdQuestions && (jdQuestions.questions as any[]).length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Standard interview questions — the 70%{jdQuestions.source ? ` · ${jdQuestions.source}` : ''} (auto-generated from this description)
              </label>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
                {(jdQuestions.questions as any[]).map((q: any, i: number) => (
                  <li key={i}>{q.question}{q.category ? <span className="text-gray-400"> ({q.category})</span> : null}</li>
                ))}
              </ol>
              <p className="text-xs text-gray-400 mt-2">The tailored ~30% is curated and emailed to the interviewer later, after the candidate's EPP/values review.</p>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={!form.reqId || !form.jobTitle || saving}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save as Draft'}
            </button>
            <button onClick={closeForm} className="px-4 py-2 text-gray-600 text-sm">
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
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Requisition</th>
                <th className="px-4 py-3">EPP Values</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {jobDescriptions.map((jd) => (
                <tr key={jd.id} className={`border-b border-gray-50 text-sm ${(jd as any).pendingReview ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {jd.jobTitle}
                    {(jd as any).pendingReview && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-amber-200 text-amber-800 align-middle">NEW JD for review</span>
                    )}
                    <div className="text-gray-400 text-xs font-normal mt-0.5">Work sample: {(jd as any).workSampleUploadName ? (jd as any).workSampleUploadName : 'None uploaded'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-medium">{getReqDept(jd.reqId)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{getReqLabel(jd.reqId)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {Array.isArray(jd.eppValues) && (jd.eppValues as string[]).length > 0
                      ? (jd.eppValues as string[]).slice(0, 3).join(', ') + ((jd.eppValues as string[]).length > 3 ? ` +${(jd.eppValues as string[]).length - 3}` : '')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[jdStatus(jd)] ?? ''}`}>
                      {jdStatus(jd)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(jd as any).pendingReview && (
                        <button
                          onClick={() => approveReviewMutation.mutate({ id: jd.id })}
                          disabled={approveReviewMutation.isLoading}
                          className="p-1 text-gray-400 hover:text-amber-600 transition-colors"
                          title="Approve new JD (clears the review flag)"
                        >
                          <CheckCircle2 size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(jd)}
                        className="p-1 text-gray-400 hover:text-ls-primary transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(jd)}
                        disabled={deleteMutation.isLoading}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
