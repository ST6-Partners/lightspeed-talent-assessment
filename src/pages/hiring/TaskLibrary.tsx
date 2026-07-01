import { useState } from 'react';
import { Plus, X, Trash2, Pencil } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const DIFFICULTIES = ['Entry', 'Mid', 'Senior'] as const;
const STATUSES = ['Draft', 'In Review', 'Live', 'Retired'] as const;

const STATUS_COLORS: Record<string, string> = {
  Live: 'bg-green-100 text-green-700',
  Draft: 'bg-gray-100 text-gray-600',
  'In Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-gray-100 text-gray-400',
};

type Form = {
  title: string; departmentId: string; difficulty: typeof DIFFICULTIES[number];
  timeLimitMin: string; brief: string; showYourWorkInstructions: string;
  scoringGuideWork: string; scoringGuideAi: string; status: typeof STATUSES[number]; version: string;
};
const EMPTY: Form = {
  title: '', departmentId: '', difficulty: 'Mid', timeLimitMin: '',
  brief: '', showYourWorkInstructions: '', scoringGuideWork: '', scoringGuideAi: '',
  status: 'Draft', version: '1',
};

export default function TaskLibrary() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const { data: tasks, refetch } = trpc.tasks.list.useQuery();
  const { data: departments } = trpc.departments.list.useQuery();
  const createMutation = trpc.tasks.create.useMutation({ onSuccess: () => { refetch(); close(); } });
  const updateMutation = trpc.tasks.update.useMutation({ onSuccess: () => { refetch(); close(); } });
  const deleteMutation = trpc.tasks.delete.useMutation({ onSuccess: () => refetch() });

  const close = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); };

  const deptName = (id: string | null) =>
    id ? (departments?.find((d: any) => d.id === id)?.name ?? 'Unknown') : 'General';

  const startEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      title: t.title, departmentId: t.departmentId ?? '', difficulty: t.difficulty ?? 'Mid',
      timeLimitMin: t.timeLimitMin != null ? String(t.timeLimitMin) : '',
      brief: t.brief ?? '', showYourWorkInstructions: t.showYourWorkInstructions ?? '',
      scoringGuideWork: t.scoringGuideWork ?? '', scoringGuideAi: t.scoringGuideAi ?? '',
      status: t.status ?? 'Draft', version: t.version != null ? String(t.version) : '1',
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.title) return;
    const payload = {
      title: form.title,
      departmentId: form.departmentId ? form.departmentId : null,
      difficulty: form.difficulty,
      timeLimitMin: form.timeLimitMin ? parseInt(form.timeLimitMin) : null,
      brief: form.brief || undefined,
      showYourWorkInstructions: form.showYourWorkInstructions || undefined,
      scoringGuideWork: form.scoringGuideWork || undefined,
      scoringGuideAi: form.scoringGuideAi || undefined,
      status: form.status,
      version: form.version ? parseInt(form.version) : undefined,
    };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  const saving = createMutation.isLoading || updateMutation.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Sample</h1>
          <p className="text-gray-500 text-sm mt-1">Curated work-sample tasks. Each one measures both work quality and AI skill. Scope is General (everyone) or a single department.</p>
        </div>
        <button
          onClick={() => { editingId ? close() : setShowForm(!showForm); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">{editingId ? 'Edit Task' : 'New Task'}</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={!form.title || saving}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save Task' : 'Create Task'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
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
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ver</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{t.title}</div>
                    <div className="text-gray-500 text-xs mt-0.5 line-clamp-1">{t.brief}</div>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(t)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => { if (confirm(`Delete "${t.title}"?`)) deleteMutation.mutate({ id: t.id }); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100" title="Delete"><Trash2 size={15} /></button>
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
