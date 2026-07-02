import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const JD_BADGE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Published: 'bg-green-100 text-green-700',
  Closed: 'bg-red-100 text-red-700',
};

function phase(updatedAt: string) {
  const posted = new Date(updatedAt).getTime();
  const days = (Date.now() - posted) / 86400000;
  const external = new Date(posted + 3 * 86400000).toISOString().slice(0, 10);
  if (days < 3) return { label: `Internal · ${Math.max(1, Math.ceil(3 - days))}d left`, cls: 'bg-blue-100 text-blue-700', external };
  return { label: 'External', cls: 'bg-green-100 text-green-700', external };
}

export default function Postings() {
  const { data: reqs } = trpc.requisitions.list.useQuery();
  const { data: jds } = trpc.jobDescriptions.list.useQuery(undefined);

  const open = (reqs ?? []).filter((r: any) => r.status === 'Open');
  const jdByReq: Record<string, any> = {};
  for (const jd of (jds ?? []) as any[]) { if (!jdByReq[jd.reqId]) jdByReq[jd.reqId] = jd; }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={20} className="text-ls-primary" />
        <h1 className="text-2xl font-bold text-gray-900">Open Roles</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">Roles posted from approved intakes — internal first (3-day window), then external.</p>

      <div className="bg-white rounded-lg border border-gray-200">
        {open.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No roles posted yet. Approve an intake all the way through to post a role here.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Hiring Manager</th>
                <th className="px-4 py-3">Openings</th>
                <th className="px-4 py-3">Posting</th>
                <th className="px-4 py-3">Job Description</th>
                <th className="px-4 py-3">Posted</th>
              </tr>
            </thead>
            <tbody>
              {open.map((r: any) => {
                const jd = jdByReq[r.id];
                const ph = phase(r.updatedAt);
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                    <td className="px-4 py-3 font-medium text-gray-900">{jd?.jobTitle ?? `${r.department} role`}</td>
                    <td className="px-4 py-3 text-gray-600">{r.department}</td>
                    <td className="px-4 py-3 text-gray-600">{r.hiringManager}</td>
                    <td className="px-4 py-3 text-gray-600">{r.numOpenings}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${ph.cls}`}>{ph.label}</span>
                      <div className="text-xs text-gray-400 mt-0.5">external {ph.external}</div>
                    </td>
                    <td className="px-4 py-3">
                      {jd ? (
                        <Link to="/hiring/jobs" className="inline-flex items-center gap-1 text-ls-primary hover:underline">
                          <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${JD_BADGE[jd.status] ?? ''}`}>{jd.status}</span>
                        </Link>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
