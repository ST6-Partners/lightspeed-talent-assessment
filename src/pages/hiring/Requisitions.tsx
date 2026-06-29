import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  'Pending Approval': 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-blue-100 text-blue-700',
  Open: 'bg-green-100 text-green-700',
  'On Hold': 'bg-orange-100 text-orange-700',
  Closed: 'bg-red-100 text-red-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: 'text-gray-500',
  Medium: 'text-blue-600',
  High: 'text-orange-500',
  Critical: 'text-red-600 font-semibold',
};

const DEPARTMENTS = [
  'Engineering', 'Product', 'Sales', 'Marketing', 'Operations',
  'Finance', 'HR', 'Customer Success', 'Legal', 'Other',
];

export default function Requisitions() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    department: '', hiringManager: '', numOpenings: 1,
    employmentType: 'Full-Time' as const, location: '', remote: false,
    salaryMin: '', salaryMax: '', reason: '', priority: 'Medium' as const,
  });

  const { data: requisitions, refetch } = trpc.requisitions.list.useQuery();
  const createMutation = trpc.requisitions.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); resetForm(); },
  });

  const resetForm = () => setForm({
    department: '', hiringManager: '', numOpenings: 1,
    employmentType: 'Full-Time', location: '', remote: false,
    salaryMin: '', salaryMax: '', reason: '', priority: 'Medium',
  });

  const handleSubmit = () => {
    if (!form.department || !form.hiringManager) return;
    createMutation.mutate({
      ...form,
      salaryMin: form.salaryMin ? parseInt(form.salaryMin) : undefined,
      salaryMax: form.salaryMax ? parseInt(form.salaryMax) : undefined,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Requisitions</h1>
          <p className="text-gray-500 text-sm mt-1">Create and track open headcount requests</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          New Requisition
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">New Job Requisition</span>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department *</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hiring Manager *</label>
              <input
                type="text"
                value={form.hiringManager}
                onChange={(e) => setForm({ ...form, hiringManager: e.target.value })}
                placeholder="e.g. Wes Anderson"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Number of Openings</label>
              <input
                type="number" min={1}
                value={form.numOpenings}
                onChange={(e) => setForm({ ...form, numOpenings: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
              <select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              >
                {['Full-Time', 'Part-Time', 'Contract', 'Internship'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Austin, TX"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              >
                {['Low', 'Medium', 'High', 'Critical'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salary Min ($)</label>
              <input
                type="number"
                value={form.salaryMin}
                onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                placeholder="e.g. 80000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salary Max ($)</label>
              <input
                type="number"
                value={form.salaryMax}
                onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                placeholder="e.g. 120000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason for hire</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={2}
                placeholder="e.g. Backfill for departure, new headcount for Q3 growth..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="remote"
                checked={form.remote}
                onChange={(e) => setForm({ ...form, remote: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="remote" className="text-sm text-gray-700">Remote eligible</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSubmit}
              disabled={!form.department || !form.hiringManager || createMutation.isLoading}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50"
            >
              {createMutation.isLoading ? 'Creating...' : 'Create Requisition'}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-600 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!requisitions || requisitions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No requisitions yet. Create one to get started.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Hiring Manager</th>
                <th className="px-4 py-3">Openings</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.department}</td>
                  <td className="px-4 py-3 text-gray-600">{r.hiringManager}</td>
                  <td className="px-4 py-3 text-gray-600">{r.numOpenings}</td>
                  <td className={`px-4 py-3 text-sm ${PRIORITY_COLORS[r.priority] ?? ''}`}>{r.priority}</td>
                  <td className="px-4 py-3 text-gray-500">{r.employmentType}{r.remote ? ' · Remote' : ''}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[r.status] ?? ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
