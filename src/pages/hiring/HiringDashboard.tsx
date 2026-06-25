import { trpc } from '../../lib/trpc';

const STAGE_ORDER = [
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

export default function HiringDashboard() {
  const { data: candidates } = trpc.candidates.list.useQuery();
  const { data: requisitions } = trpc.requisitions.list.useQuery();
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();

  const activeReqs = (requisitions ?? []).filter((r) => r.status === 'Open').length;
  const activeCandidates = (candidates ?? []).filter((c) => c.currentStage !== 'Rejected' && c.currentStage !== 'Hired').length;
  const hiredTotal = (candidates ?? []).filter((c) => c.currentStage === 'Hired').length;
  const publishedJds = (jobDescriptions ?? []).filter((j) => j.status === 'Published').length;

  const stageCounts = STAGE_ORDER.reduce<Record<string, number>>((acc, stage) => {
    acc[stage] = (candidates ?? []).filter((c) => c.currentStage === stage).length;
    return acc;
  }, {});

  const recent = [...(candidates ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 8);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hiring Pipeline</h1>
        <p className="text-gray-500 text-sm mt-1">Lightspeed talent assessment overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Open requisitions', value: activeReqs, sub: 'Approved or open' },
          { label: 'Active candidates', value: activeCandidates, sub: 'In pipeline' },
          { label: 'Published JDs', value: publishedJds, sub: 'Accepting applications' },
          { label: 'Hired this cycle', value: hiredTotal, sub: 'All time' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{card.label}</div>
            <div className="text-3xl font-bold text-gray-900">{card.value ?? '—'}</div>
            <div className="text-xs text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Funnel breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-3">Pipeline by stage</div>
        <div className="flex gap-2 flex-wrap">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="flex flex-col items-center min-w-[80px]">
              <div className={`text-xl font-bold px-3 py-1 rounded-lg ${STAGE_COLORS[stage]}`}>
                {stageCounts[stage]}
              </div>
              <div className="text-[11px] text-gray-500 mt-1 text-center leading-tight">{stage}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent candidates */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">Recent candidates</span>
        </div>
        {!recent.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">No candidates yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">CCAT</th>
                <th className="px-4 py-3">Applied</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_COLORS[c.currentStage] ?? ''}`}>
                      {c.currentStage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.ccatScore ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
