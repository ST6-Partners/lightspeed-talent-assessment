import { useState } from 'react';
import { Plus, X, Copy, Check } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  submitted: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-400',
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  submitted: 'Submitted',
  expired: 'Expired',
};

const candidateLink = (token: string) => `${window.location.origin}/assessment/${token}`;

type Form = { packageId: string; candidateEmail: string; scheduledStart: string };
const EMPTY: Form = { packageId: '', candidateEmail: '', scheduledStart: '' };

export default function Sessions() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: sessions, refetch } = trpc.sessions.list.useQuery();
  const { data: packages } = trpc.packages.list.useQuery();

  const scheduleMutation = trpc.sessions.schedule.useMutation({
    onSuccess: (created: any) => {
      refetch();
      setCreatedLink(candidateLink(created.token));
      setForm(EMPTY);
      setShowForm(false);
    },
  });

  const close = () => { setShowForm(false); setForm(EMPTY); };

  const pkgName = (id: string) => packages?.find((p: any) => p.id === id)?.name ?? 'Unknown';

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  const handleSubmit = () => {
    if (!form.packageId || !form.candidateEmail) return;
    scheduleMutation.mutate({
      packageId: form.packageId,
      candidateEmail: form.candidateEmail,
      scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : undefined,
    });
  };

  const saving = scheduleMutation.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-500 text-sm mt-1">Schedule timed assessment sessions for candidates and share their private link.</p>
        </div>
        <button
          onClick={() => { showForm ? close() : setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
        >
          <Plus size={16} />
          Schedule session
        </button>
      </div>

      {createdLink && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-green-800">Session scheduled</div>
            <div className="text-xs text-green-700 truncate mt-0.5">{createdLink}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => copy(createdLink, 'created')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ls-primary text-white rounded-md text-xs font-medium hover:bg-ls-primary-600">
              {copiedKey === 'created' ? <Check size={14} /> : <Copy size={14} />}
              {copiedKey === 'created' ? 'Copied' : 'Copy link'}
            </button>
            <button onClick={() => setCreatedLink(null)} className="text-green-500 hover:text-green-700"><X size={16} /></button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">Schedule session</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assignment *</label>
              <select value={form.packageId}
                onChange={(e) => setForm({ ...form, packageId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                <option value="">— select —</option>
                {packages?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Candidate email *</label>
              <input type="email" value={form.candidateEmail}
                onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
                placeholder="candidate@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled start (optional)</label>
              <input type="datetime-local" value={form.scheduledStart}
                onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={!form.packageId || !form.candidateEmail || saving}
              className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              {saving ? 'Scheduling...' : 'Schedule session'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!sessions || sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No sessions yet. Schedule one to get started.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Assignment</th>
                <th className="px-4 py-3">Scheduled start</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Link</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s: any) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm align-top">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.candidateEmail}</td>
                  <td className="px-4 py-3 text-gray-600">{pkgName(s.packageId)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(s.scheduledStart)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[s.status] ?? ''}`}>{STATUS_LABELS[s.status] ?? s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button onClick={() => copy(candidateLink(s.token), s.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-gray-600 border border-gray-200 rounded-md text-xs font-medium hover:bg-gray-50">
                        {copiedKey === s.id ? <Check size={13} /> : <Copy size={13} />}
                        {copiedKey === s.id ? 'Copied' : 'Copy link'}
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
