import { useState } from 'react';
import { Plus, X, Trash2, Pencil } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STATUSES = ['Draft', 'In Review', 'Live', 'Retired'] as const;
const STATUS_COLORS: Record<string, string> = {
  Live: 'bg-green-100 text-green-700',
  Draft: 'bg-gray-100 text-gray-600',
  'In Review': 'bg-amber-100 text-amber-700',
  Retired: 'bg-gray-100 text-gray-400',
};

type Form = {
  name: string; departmentId: string; generalTaskId: string;
  functionalTaskId: string; status: typeof STATUSES[number]; version: string;
  deliveryMode: 'scheduled' | 'open'; windowMinutes: string;
};
const EMPTY: Form = {
  name: '', departmentId: '', generalTaskId: '', functionalTaskId: '', status: 'Draft', version: '1',
  deliveryMode: 'scheduled', windowMinutes: '90',
};

export default function Assignments() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const { data: packages, refetch } = trpc.packages.list.useQuery();
  const { data: departments } = trpc.departments.list.useQuery();
  const { data: tasks } = trpc.tasks.list.useQuery();
  const createMutation = trpc.packages.create.useMutation({ onSuccess: () => { refetch(); close(); } });
  const updateMutation = trpc.packages.update.useMutation({ onSuccess: () => { refetch(); close(); } });
  const deleteMutation = trpc.packages.delete.useMutation({ onSuccess: () => refetch() });

  const close = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); };

  const deptName = (id: string | null) => (id ? (departments?.find((d: any) => d.id === id)?.name ?? 'Unknown') : '—');
  const taskTitle = (id: string | null) => (id ? (tasks?.find((t: any) => t.id === id)?.title ?? 'Unknown') : '—');

  const generalTasks = (tasks ?? []).filter((t: any) => !t.departmentId);
  const functionalTasks = (tasks ?? []).filter((t: any) => form.departmentId && t.departmentId === form.departmentId);

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name, departmentId: p.departmentId ?? '', generalTaskId: p.generalTaskId ?? '',
      functionalTaskId: p.functionalTaskId ?? '', status: p.status ?? 'Draft',
      version: p.version != null ? String(p.version) : '1',
      deliveryMode: p.deliveryMode ?? 'scheduled',
      windowMinutes: p.windowMinutes != null ? String(p.windowMinutes) : '90',
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name) return;
    const payload = {
      name: form.name,
      departmentId: form.departmentId ? form.departmentId : null,
      generalTaskId: form.generalTaskId ? form.generalTaskId : null,
      functionalTaskId: form.functionalTaskId ? form.functionalTaskId : null,
      status: form.status,
      version: form.version ? parseInt(form.version) : undefined,
      deliveryMode: form.deliveryMode,
      windowMinutes: form.windowMinutes ? parseInt(form.windowMinutes) : 90,
    };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  const saving = createMutation.isLoading || updateMutation.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="text-gray-500 text-sm mt-1">What a candidate receives: one General baseline task + one function-specific task. The department drives which assignment is sent.</p>
        </div>
        <button
          onClick={() => { editingId ? close() : setShowForm(!showForm); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          New Assignment
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">{editingId ? 'Edit Assignment' : 'New Assignment'}</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Assignment name *</label>
              <input type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Engineering assessment"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Target department (routing)</label>
              <select value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value, functionalTaskId: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                <option value="">— select —</option>
                {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">General task (everyone)</label>
              <select value={form.generalTaskId}
                onChange={(e) => setForm({ ...form, generalTaskId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                <option value="">— select —</option>
                {generalTasks.map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Functional task {form.departmentId ? '' : '(pick a department first)'}</label>
              <select value={form.functionalTaskId} disabled={!form.departmentId}
                onChange={(e) => setForm({ ...form, functionalTaskId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan disabled:bg-gray-50 disabled:text-gray-400">
                <option value="">— select —</option>
                {functionalTasks.map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery mode</label>
              <select value={form.deliveryMode}
                onChange={(e) => setForm({ ...form, deliveryMode: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                <option value="scheduled">Scheduled</option>
                <option value="open">Open</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Window (minutes)</label>
              <input type="number" value={form.windowMinutes}
                onChange={(e) => setForm({ ...form, windowMinutes: e.target.value })}
                placeholder="90"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={!form.name || saving}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save Assignment' : 'Create Assignment'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!packages || packages.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No assignments yet. Pair a General task with a functional one to get started.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Assignment</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">General task</th>
                <th className="px-4 py-3">Functional task</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ver</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm align-top">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full font-medium bg-blue-100 text-blue-700">{deptName(p.departmentId)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{taskTitle(p.generalTaskId)}</td>
                  <td className="px-4 py-3 text-gray-600">{taskTitle(p.functionalTaskId)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[p.status] ?? ''}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">v{p.version}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate({ id: p.id }); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100" title="Delete"><Trash2 size={15} /></button>
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
