import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Pencil } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const PILLARS = ['Mission-Driven', 'Customer-Obsessed', 'Results-Focused'] as const;
const CATEGORIES = ['Approach to our work', 'Team dynamics', 'Individual practice'];
const PILLAR_COLORS: Record<string, string> = {
  'Mission-Driven': 'bg-purple-100 text-purple-700',
  'Customer-Obsessed': 'bg-teal-100 text-teal-700',
  'Results-Focused': 'bg-blue-100 text-blue-700',
};

type Form = {
  name: string; pillar: typeof PILLARS[number]; category: string;
  description: string; eppDimensions: string; sortOrder: string;
};
const EMPTY: Form = {
  name: '', pillar: 'Mission-Driven', category: 'Approach to our work',
  description: '', eppDimensions: '', sortOrder: '',
};

export default function Values() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const { data: values, refetch } = trpc.values.list.useQuery();
  const [tpOpen, setTpOpen] = useState(false);
  const [who, setWho] = useState('');
  const [depts, setDepts] = useState<{ name: string; size: string }[]>([]);
  const tpQuery = trpc.values.getTalkingPoints.useQuery();
  const tpSave = trpc.values.setTalkingPoints.useMutation({ onSuccess: () => tpQuery.refetch() });
  useEffect(() => {
    if (tpQuery.data) { setWho(tpQuery.data.whoWeAre ?? ''); setDepts(tpQuery.data.departments ?? []); }
  }, [tpQuery.data]);
  const createMutation = trpc.values.create.useMutation({ onSuccess: () => { refetch(); close(); } });
  const updateMutation = trpc.values.update.useMutation({ onSuccess: () => { refetch(); close(); } });
  const deleteMutation = trpc.values.delete.useMutation({ onSuccess: () => refetch() });

  const close = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); };

  const startEdit = (v: any) => {
    setEditingId(v.id);
    setForm({
      name: v.name, pillar: v.pillar, category: v.category ?? 'Approach to our work',
      description: v.description ?? '',
      eppDimensions: Array.isArray(v.eppDimensions) ? v.eppDimensions.join(', ') : '',
      sortOrder: v.sortOrder != null ? String(v.sortOrder) : '',
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name) return;
    const payload = {
      name: form.name,
      pillar: form.pillar,
      category: form.category || undefined,
      description: form.description || undefined,
      eppDimensions: form.eppDimensions
        ? form.eppDimensions.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      sortOrder: form.sortOrder ? parseInt(form.sortOrder) : undefined,
    };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  const saving = createMutation.isLoading || updateMutation.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Values</h1>
          <p className="text-gray-500 text-sm mt-1">The Lightspeed Way — the scoreable values candidates are assessed on</p>
        </div>
        <button
          onClick={() => { editingId ? close() : setShowForm(!showForm); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          New Value
        </button>
      </div>

      {/* Interview talking points — who we are + department sizes. These, together
          with the values below, are attached to every interview briefing. */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <button onClick={() => setTpOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left px-5 py-3">
          <span className="text-sm font-semibold text-gray-700">Interview talking points</span>
          <span className="text-xs text-gray-400">{tpOpen ? 'Hide' : 'Edit'}</span>
        </button>
        {tpOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500">Shown to every interviewer in every briefing, together with the values below. Department sizes are optional.</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Who we are</label>
              <textarea value={who} onChange={(e) => setWho(e.target.value)} rows={4}
                placeholder="A short, honest overview of the company to give every candidate."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Departments &amp; sizes</label>
              <div className="space-y-2">
                {depts.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={d.name} onChange={(e) => setDepts((arr) => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Department (e.g. Engineering)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                    <input value={d.size} onChange={(e) => setDepts((arr) => arr.map((x, j) => j === i ? { ...x, size: e.target.value } : x))}
                      placeholder="Size (e.g. 45)"
                      className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                    <button onClick={() => setDepts((arr) => arr.filter((_, j) => j !== i))}
                      className="p-2 text-gray-400 hover:text-red-600" title="Remove"><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={() => setDepts((arr) => [...arr, { name: '', size: '' }])}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-ls-primary"><Plus size={13} /> Add department</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => tpSave.mutate({ whoWeAre: who, departments: depts.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), size: d.size.trim() })) })}
                disabled={tpSave.isLoading}
                className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
                {tpSave.isLoading ? 'Saving...' : 'Save talking points'}</button>
              {tpSave.isSuccess && <span className="text-xs text-green-600">Saved</span>}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">{editingId ? 'Edit Value' : 'New Value'}</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value name *</label>
              <input type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Grit"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pillar</label>
              <select value={form.pillar}
                onChange={(e) => setForm({ ...form, pillar: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
              <input type="number" value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                placeholder="e.g. 1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                placeholder="What this value looks like in practice"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">EPP dimensions (comma-separated)</label>
              <input type="text" value={form.eppDimensions}
                onChange={(e) => setForm({ ...form, eppDimensions: e.target.value })}
                placeholder="e.g. conscientiousness, achievement"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={!form.name || saving}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save Value' : 'Create Value'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!values || values.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No values yet. Add one to get started.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Pillar</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">EPP dimensions</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {values.map((v: any) => (
                <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{v.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{v.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${PILLAR_COLORS[v.pillar] ?? ''}`}>{v.pillar}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.category}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{Array.isArray(v.eppDimensions) ? v.eppDimensions.join(', ') : ''}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(v)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => deleteMutation.mutate({ id: v.id })} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100" title="Delete"><Trash2 size={15} /></button>
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
