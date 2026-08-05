import { useState, Fragment } from 'react';
import { Plus, X, Trash2, Pencil, ChevronRight, ChevronDown, PenLine, Upload, Check, Archive, Mail } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const DIFFICULTIES = ['Entry', 'Mid', 'Senior'] as const;
const STATUSES = ['Draft', 'In Review', 'Live', 'Retired'] as const;

const STATUS_COLORS: Record<string, string> = {
  Live: 'bg-green-100 text-green-700',
  Draft: 'bg-gray-100 text-gray-600',
  'In Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-gray-100 text-gray-400',
};

type Opt = { text: string; correct: boolean };

type Form = {
  title: string; departmentId: string; difficulty: typeof DIFFICULTIES[number];
  timeLimitMin: string; brief: string; showYourWorkInstructions: string;
  scoringGuideWork: string; scoringGuideAi: string; status: typeof STATUSES[number]; version: string;
  deliveryMode: 'take_home' | 'live_walkthrough';
  answerFormat: 'free_text' | 'multi_select';
  options: Opt[]; selectCount: string;
  approverEmail: string;
};
const EMPTY: Form = {
  title: '', departmentId: '', difficulty: 'Mid', timeLimitMin: '',
  brief: '', showYourWorkInstructions: '', scoringGuideWork: '', scoringGuideAi: '',
  status: 'Draft', version: '1', deliveryMode: 'take_home',
  answerFormat: 'free_text', options: [{ text: '', correct: false }, { text: '', correct: false }], selectCount: '',
  approverEmail: '',
};

export default function TaskLibrary() {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<'write' | 'upload'>('write');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const { data: tasks, refetch } = trpc.tasks.list.useQuery();
  const { data: departments } = trpc.departments.list.useQuery();
  const { data: jds, refetch: refetchJds } = trpc.jobDescriptions.list.useQuery();
  const uploadedJds = (jds ?? []).filter((j: any) => j.workSampleUploadUrl);
  const createMutation = trpc.tasks.create.useMutation({ onSuccess: () => { refetch(); close(); } });
  const updateMutation = trpc.tasks.update.useMutation({ onSuccess: () => { refetch(); close(); } });
  const deleteMutation = trpc.tasks.delete.useMutation({ onSuccess: () => refetch() });
  const approveMutation = trpc.tasks.approve.useMutation({ onSuccess: () => refetch() });
  const retireMutation = trpc.tasks.retire.useMutation({ onSuccess: () => refetch() });
  const resendMutation = trpc.tasks.resendReview.useMutation({ onSuccess: () => { refetch(); setResend(null); } });
  const [resend, setResend] = useState<{ id: string; title: string; email: string } | null>(null);
  const linkJdMutation = trpc.jobDescriptions.setWorkSampleTask.useMutation({ onSuccess: () => refetchJds() });
  const draftMutation = trpc.tasks.draftFromUpload.useMutation();

  const close = () => {
    setShowForm(false); setEditingId(null); setForm(EMPTY);
    setMode('write'); setUploadError(null); setDraftNote(null);
  };

  const openNew = () => {
    if (editingId) { close(); return; }
    if (showForm) { close(); return; }
    setForm(EMPTY); setMode('write'); setUploadError(null); setDraftNote(null); setShowForm(true);
  };

  const deptName = (id: string | null) =>
    id ? (departments?.find((d: any) => d.id === id)?.name ?? 'Unknown') : 'General';

  const startEdit = (t: any) => {
    setEditingId(t.id);
    const opts: Opt[] = Array.isArray(t.options) && t.options.length
      ? t.options.map((o: string) => ({ text: o, correct: (t.correctOptions ?? []).includes(o) }))
      : [{ text: '', correct: false }, { text: '', correct: false }];
    setForm({
      title: t.title, departmentId: t.departmentId ?? '', difficulty: t.difficulty ?? 'Mid',
      timeLimitMin: t.timeLimitMin != null ? String(t.timeLimitMin) : '',
      brief: t.brief ?? '', showYourWorkInstructions: t.showYourWorkInstructions ?? '',
      scoringGuideWork: t.scoringGuideWork ?? '', scoringGuideAi: t.scoringGuideAi ?? '',
      status: t.status ?? 'Draft', version: t.version != null ? String(t.version) : '1',
      deliveryMode: t.deliveryMode === 'live_walkthrough' ? 'live_walkthrough' : 'take_home',
      answerFormat: t.answerFormat === 'multi_select' ? 'multi_select' : 'free_text',
      options: opts,
      selectCount: t.selectCount != null ? String(t.selectCount) : '',
      approverEmail: '',
    });
    setMode('write'); setShowForm(true); setUploadError(null); setDraftNote(null);
  };

  const handleSubmit = () => {
    if (!form.title) return;
    const isPick = form.answerFormat === 'multi_select';
    const cleanOpts = form.options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
    const payload: any = {
      title: form.title,
      departmentId: form.departmentId ? form.departmentId : null,
      difficulty: form.difficulty,
      timeLimitMin: form.timeLimitMin ? parseInt(form.timeLimitMin) : null,
      brief: form.brief || undefined,
      showYourWorkInstructions: form.showYourWorkInstructions || undefined,
      scoringGuideWork: form.scoringGuideWork || undefined,
      scoringGuideAi: form.scoringGuideAi || undefined,
      version: form.version ? parseInt(form.version) : undefined,
      deliveryMode: form.deliveryMode,
      answerFormat: form.answerFormat,
      options: isPick ? cleanOpts.map((o) => o.text) : null,
      correctOptions: isPick ? cleanOpts.filter((o) => o.correct).map((o) => o.text) : null,
      selectCount: isPick
        ? (form.selectCount ? parseInt(form.selectCount) : cleanOpts.filter((o) => o.correct).length)
        : null,
    };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate({ ...payload, approverEmail: form.approverEmail || undefined });
  };

  const pickError = (): string | null => {
    if (form.answerFormat !== 'multi_select') return null;
    const opts = form.options.map((o) => o.text.trim()).filter(Boolean);
    if (opts.length < 2) return 'Add at least two options.';
    if (!form.options.some((o) => o.correct && o.text.trim())) return 'Mark at least one option as correct.';
    return null;
  };

  const handleUpload = async (file: File) => {
    setUploadError(null); setDraftNote(null); setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const resp = await fetch('/api/upload/work-sample', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-filename': encodeURIComponent(file.name),
        },
        body: buffer,
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) { setUploadError(result.error || 'Upload failed'); return; }
      const draft = await draftMutation.mutateAsync({ key: result.key });
      const opts: Opt[] = draft.answerFormat === 'multi_select' && Array.isArray(draft.options) && draft.options.length
        ? draft.options.map((o: string) => ({ text: o, correct: (draft.correctOptions ?? []).includes(o) }))
        : [{ text: '', correct: false }, { text: '', correct: false }];
      setForm({
        title: draft.title ?? '', departmentId: '', difficulty: (draft.difficulty as any) ?? 'Mid',
        timeLimitMin: draft.timeLimitMin != null ? String(draft.timeLimitMin) : '',
        brief: draft.brief ?? '', showYourWorkInstructions: draft.showYourWorkInstructions ?? '',
        scoringGuideWork: draft.scoringGuideWork ?? '', scoringGuideAi: draft.scoringGuideAi ?? '',
        status: 'Draft', version: '1', deliveryMode: 'take_home',
        answerFormat: draft.answerFormat === 'multi_select' ? 'multi_select' : 'free_text',
        options: opts,
        selectCount: draft.selectCount != null ? String(draft.selectCount) : '',
        approverEmail: '',
      });
      setDraftNote(draft.sandbox
        ? 'Draft created in sandbox mode (no AI key set) — edit the fields below, then save.'
        : 'Draft created from your upload. Review and edit everything below, then save.');
      setMode('write');
    } catch (err: any) {
      setUploadError(err?.message || 'Could not turn that file into a task.');
    } finally {
      setUploading(false);
    }
  };

  const saving = createMutation.isLoading || updateMutation.isLoading;
  const pe = pickError();

  const setOpt = (i: number, patch: Partial<Opt>) =>
    setForm({ ...form, options: form.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const addOpt = () => setForm({ ...form, options: [...form.options, { text: '', correct: false }] });
  const removeOpt = (i: number) =>
    setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Sample</h1>
          <p className="text-gray-500 text-sm mt-1">Curated work-sample tasks. Each one measures both work quality and AI skill. Scope is General (everyone) or a single department.</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      {/* Work samples uploaded to a JD */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-sm font-semibold text-gray-700">Uploaded work samples</div>
          <p className="text-xs text-gray-500 mt-0.5">Work samples uploaded to a job description show up here.</p>
        </div>
        {uploadedJds.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No work samples uploaded yet. Upload one from a job description.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Job description</th>
                <th className="px-4 py-3">Work sample file</th>
                <th className="px-4 py-3">Step</th>
              </tr>
            </thead>
            <tbody>
              {uploadedJds.map((j: any) => (
                <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{j.jobTitle}</td>
                  <td className="px-4 py-3">
                    <a href={j.workSampleUploadUrl} target="_blank" rel="noreferrer" className="text-ls-primary hover:underline">
                      {j.workSampleUploadName || 'Open file'}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{j.workSampleRequired ? 'Included in pipeline' : 'Not in pipeline'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">{editingId ? 'Edit Task' : 'New Task'}</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          {/* Mode picker (only when creating a new task) */}
          {!editingId && (
            <div className="inline-flex rounded-lg border border-gray-200 p-1 mb-5 bg-gray-50">
              <button
                onClick={() => setMode('write')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${mode === 'write' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <PenLine size={14} /> Write it
              </button>
              <button
                onClick={() => setMode('upload')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${mode === 'upload' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Upload size={14} /> Upload it
              </button>
            </div>
          )}

          {/* Upload mode */}
          {!editingId && mode === 'upload' && (
            <div className="mb-5">
              <label className={`flex flex-col items-center justify-center gap-2 px-4 py-10 border-2 border-dashed border-gray-300 rounded-lg text-sm cursor-pointer hover:border-ls-primary ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                <Upload size={22} className="text-gray-400" />
                <span className="text-gray-700 font-medium">{uploading ? 'Reading your file…' : 'Upload a work sample'}</span>
                <span className="text-xs text-gray-400">Screenshot (PNG/JPG), PDF, or text file — we turn it into a draft task you can edit.</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ''; }}
                />
              </label>
              {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
              <p className="text-[11px] text-gray-400 mt-2">The draft appears below in the editor. Nothing is saved until you press Create Task.</p>
            </div>
          )}

          {/* Editor (shown for Write it, for Edit, and after an upload draft loads) */}
          {(editingId || mode === 'write') && (
          <>
          {draftNote && (
            <div className="mb-4 text-xs text-ls-primary bg-cyan-50 border border-cyan-200 rounded-md px-3 py-2">{draftNote}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Task title *</label>
              <input type="text" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Ambiguous problem breakdown"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scope</label>
              <select value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                <option value="">General (everyone)</option>
                {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Difficulty</label>
                <select value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time (min)</label>
                <input type="number" value={form.timeLimitMin}
                  onChange={(e) => setForm({ ...form, timeLimitMin: e.target.value })}
                  placeholder="45"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Version</label>
                <input type="number" value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">How the candidate completes this</label>
              <select value={form.deliveryMode}
                onChange={(e) => setForm({ ...form, deliveryMode: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                <option value="take_home">Take-home — candidate submits their work (auto-scored)</option>
                <option value="live_walkthrough">Live walkthrough — candidate walks the panel through it on a Zoom round (human-scored)</option>
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                {form.deliveryMode === 'live_walkthrough'
                  ? 'Sending this work sample creates a "Work Sample Walkthrough" interview round instead of emailing a homework link.'
                  : 'Sending this work sample emails the candidate a link to submit their answer.'}
              </p>
            </div>

            {/* Answer format */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Answer type</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setForm({ ...form, answerFormat: 'free_text' })}
                  className={`flex-1 px-3 py-2 rounded-md text-sm border ${form.answerFormat === 'free_text' ? 'border-ls-primary bg-cyan-50 text-gray-900 font-medium' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                  Written answer
                </button>
                <button type="button"
                  onClick={() => setForm({ ...form, answerFormat: 'multi_select' })}
                  className={`flex-1 px-3 py-2 rounded-md text-sm border ${form.answerFormat === 'multi_select' ? 'border-ls-primary bg-cyan-50 text-gray-900 font-medium' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                  Pick from a list
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {form.answerFormat === 'multi_select'
                  ? 'The candidate ticks options from a list. Auto-graded against the correct answers (correct answers are never shown to the candidate).'
                  : 'The candidate types or pastes their answer. Scored with the guides below.'}
              </p>
            </div>

            {/* Options editor */}
            {form.answerFormat === 'multi_select' && (
              <div className="col-span-2 rounded-md border border-gray-200 p-4 bg-gray-50/60">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">Options — tick the ones that are correct</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">How many should the candidate pick?</span>
                    <input type="number" min={1} value={form.selectCount}
                      onChange={(e) => setForm({ ...form, selectCount: e.target.value })}
                      placeholder={String(form.options.filter((o) => o.correct && o.text.trim()).length || 1)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                  </div>
                </div>
                <div className="space-y-2">
                  {form.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => setOpt(i, { correct: !o.correct })}
                        title={o.correct ? 'Correct' : 'Mark correct'}
                        className={`shrink-0 w-6 h-6 rounded flex items-center justify-center border ${o.correct ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300 text-transparent hover:border-gray-400'}`}>
                        <Check size={14} />
                      </button>
                      <input type="text" value={o.text}
                        onChange={(e) => setOpt(i, { text: e.target.value })}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                      <button type="button" onClick={() => removeOpt(i)}
                        className="shrink-0 p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100" title="Remove option">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addOpt}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ls-primary hover:text-ls-primary-600">
                  <Plus size={13} /> Add option
                </button>
                {pe && <p className="text-xs text-red-600 mt-2">{pe}</p>}
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Candidate brief — what they see</label>
              <textarea value={form.brief}
                onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={2}
                placeholder="The task as the candidate reads it"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Show-your-work instructions</label>
              <textarea value={form.showYourWorkInstructions}
                onChange={(e) => setForm({ ...form, showYourWorkInstructions: e.target.value })} rows={2}
                placeholder="Ask them to paste prompts, iterations, and what they rejected"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scoring guide — work quality</label>
              <textarea value={form.scoringGuideWork}
                onChange={(e) => setForm({ ...form, scoringGuideWork: e.target.value })} rows={3}
                placeholder="What good looks like for the output"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Scoring guide — AI skill</label>
              <textarea value={form.scoringGuideAi}
                onChange={(e) => setForm({ ...form, scoringGuideAi: e.target.value })} rows={3}
                placeholder="What good looks like for how they used AI"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              {editingId ? (
                <>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[form.status] ?? ''}`}>{form.status}</span>
                  <p className="text-xs text-gray-400 mt-1">Status changes via Approve / Retire in the list, not here.</p>
                </>
              ) : (
                <>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Send to for approval *</label>
                  <input type="email" value={form.approverEmail}
                    onChange={(e) => setForm({ ...form, approverEmail: e.target.value })}
                    placeholder="hiring manager's email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                  <p className="text-xs text-gray-400 mt-1">New tasks save as Draft. This person gets a link to review, edit, and approve it — it can't be used on a role until they do.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={!form.title || !!pe || saving || (!editingId && !form.approverEmail)}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save Task' : 'Create Task (send for approval)'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
          </>
          )}
        </div>
      )}

      {resend && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Resend approval request — {resend.title}</span>
            <button onClick={() => setResend(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Approver email</label>
          <div className="flex gap-2">
            <input type="email" value={resend.email}
              onChange={(e) => setResend({ ...resend, email: e.target.value })}
              placeholder="hiring manager's email"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <button onClick={() => resendMutation.mutate({ id: resend.id, approverEmail: resend.email })}
              disabled={!resend.email || resendMutation.isLoading}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {resendMutation.isLoading ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Sends the review link to this address and saves it as the task's approver.</p>
          {resendMutation.error && <p className="text-xs text-red-600 mt-1">{resendMutation.error.message}</p>}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!tasks || tasks.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No tasks yet. Add one to get started.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ver</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => {
                const open = previewId === t.id;
                return (
                <Fragment key={t.id}>
                <tr onClick={() => setPreviewId(open ? null : t.id)} className="border-b border-gray-50 hover:bg-gray-50 text-sm align-top cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-1.5">
                      <span className="text-gray-400 mt-0.5 shrink-0">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {t.title}
                          {(t as any).answerFormat === 'multi_select' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-ls-cyan bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5">
                              Pick {(t as any).selectCount ?? ((t as any).correctOptions?.length ?? '')}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5 line-clamp-1">{t.brief}</div>
                        {t.status === 'Draft' && (
                          <div className="text-[11px] text-amber-600 mt-0.5">
                            Pending approval{t.approverEmail ? ` · ${t.approverEmail}` : ' · no approver set'}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${t.departmentId ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{deptName(t.departmentId)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.timeLimitMin ? `${t.timeLimitMin} min` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.difficulty}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">v{t.version}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {t.status === 'Draft' && (
                        <button onClick={() => setResend({ id: t.id, title: t.title, email: t.approverEmail ?? '' })} className="p-1.5 text-gray-400 hover:text-ls-primary rounded hover:bg-gray-100" title="Resend / change approver"><Mail size={15} /></button>
                      )}
                      {t.status === 'Draft' && (
                        <button onClick={() => approveMutation.mutate({ id: t.id })} disabled={approveMutation.isLoading} className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-gray-100" title="Approve → Live"><Check size={15} /></button>
                      )}
                      {t.status === 'Live' && (
                        <button onClick={() => retireMutation.mutate({ id: t.id })} disabled={retireMutation.isLoading} className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-gray-100" title="Retire"><Archive size={15} /></button>
                      )}
                      <button onClick={() => startEdit(t)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => deleteMutation.mutate({ id: t.id })} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    <td colSpan={7} className="px-4 py-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">How the candidate sees this task</div>
                      <div className="bg-white border border-gray-200 rounded-lg p-5 max-w-2xl">
                        <div className="text-lg font-bold text-gray-900">{t.title}</div>
                        <div className="text-xs text-gray-500 mt-1">{deptName(t.departmentId)} · {t.difficulty}{t.timeLimitMin ? ` · ${t.timeLimitMin} min` : ''}</div>
                        <div className="mt-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Instructions</div>
                          <div className="text-sm text-gray-800 whitespace-pre-line">{t.brief || '—'}</div>
                        </div>
                        {(t as any).answerFormat === 'multi_select' && Array.isArray((t as any).options) && (
                          <div className="mt-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                              Options — pick {(t as any).selectCount ?? ((t as any).correctOptions?.length ?? '')}
                            </div>
                            <ul className="text-sm text-gray-800 space-y-1">
                              {(t as any).options.map((o: string, i: number) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className={`inline-block w-3.5 h-3.5 rounded-sm border ${((t as any).correctOptions ?? []).includes(o) ? 'bg-green-500 border-green-500' : 'border-gray-300'}`} />
                                  {o}
                                  {((t as any).correctOptions ?? []).includes(o) && <span className="text-[10px] text-green-600 font-semibold">correct</span>}
                                </li>
                              ))}
                            </ul>
                            <p className="text-[11px] text-gray-400 mt-1">Correct answers are shown here for staff only — the candidate never sees which are correct.</p>
                          </div>
                        )}
                        {t.showYourWorkInstructions && (
                          <div className="mt-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Show your work</div>
                            <div className="text-sm text-gray-800 whitespace-pre-line">{t.showYourWorkInstructions}</div>
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-5 mb-2">Internal — not shown to the candidate</div>
                      <div className="grid grid-cols-2 gap-3 max-w-2xl">
                        <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-md p-3"><span className="font-semibold text-gray-700">Scoring — work quality:</span> {t.scoringGuideWork || '—'}</div>
                        <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-md p-3"><span className="font-semibold text-gray-700">Scoring — AI skill:</span> {t.scoringGuideAi || '—'}</div>
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-5 mb-2">Jobs using this task</div>
                      <div className="flex flex-wrap items-center gap-2 max-w-2xl">
                        {(jds ?? []).filter((j: any) => j.workSampleTaskId === t.id).map((j: any) => (
                          <span key={j.id} className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-full pl-3 pr-1.5 py-1 text-gray-700">
                            {j.jobTitle}
                            <button
                              onClick={() => linkJdMutation.mutate({ id: j.id, taskId: null })}
                              className="text-gray-400 hover:text-red-600 rounded-full p-0.5"
                              title="Unlink from this job"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        {(jds ?? []).filter((j: any) => j.workSampleTaskId === t.id).length === 0 && (
                          <span className="text-xs text-gray-400">Not linked to any job yet.</span>
                        )}
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) linkJdMutation.mutate({ id: e.target.value, taskId: t.id }); }}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
                        >
                          <option value="">+ Link a job…</option>
                          {(jds ?? []).filter((j: any) => j.workSampleTaskId !== t.id).map((j: any) => (
                            <option key={j.id} value={j.id}>{j.jobTitle}</option>
                          ))}
                        </select>
                      </div>
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
