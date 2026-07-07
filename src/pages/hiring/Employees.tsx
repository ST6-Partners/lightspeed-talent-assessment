import { useState } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const EMPTY = { name: '', title: '', email: '', active: true };

export default function Employees() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: rows, refetch } = trpc.employees.list.useQuery();
  const close = () => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); };
  const createM = trpc.employees.create.useMutation({ onSuccess: () => { refetch(); close(); } });
  const updateM = trpc.employees.update.useMutation({ onSuccess: () => { refetch(); close(); } });
  const deleteM = trpc.employees.delete.useMutation({ onSuccess: () => refetch() });

  const startEdit = (r: any) => { setEditingId(r.id); setForm({ name: r.name ?? '', title: r.title ?? '', email: r.email ?? '', active: !!r.active }); setShowForm(true); };
  const save = () => { if (!form.name.trim()) return; editingId ? updateM.mutate({ id: editingId, ...form }) : createM.mutate(form); };
  const saving = createM.isLoading || updateM.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 text-sm mt-1">Internal staff — hiring managers, interviewers, and value reviewers</p>
        </div>
        <button onClick={() => (showForm ? close() : setShowForm(true))} className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600">
          <Plus size={16} /> New Employee
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">{editingId ? 'Edit Employee' : 'New Employee'}</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Engineering Manager"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@lightspeed.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="emp-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
              <label htmlFor="emp-active" className="text-sm text-gray-700">Active</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={!form.name.trim() || saving}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Employee'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!rows || rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No employees yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.title || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(r)} className="p-1 text-gray-400 hover:text-ls-primary" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => deleteM.mutate({ id: r.id })} className="p-1 text-gray-400 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>
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
