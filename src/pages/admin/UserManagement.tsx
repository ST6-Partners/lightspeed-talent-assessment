import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { Search, Clock, Info } from 'lucide-react';

const ROLE_OPTIONS = ['user', 'manager', 'admin', 'sysadmin'] as const;

const ROLE_COLORS: Record<string, string> = {
  sysadmin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  manager: 'bg-green-100 text-green-800',
  user: 'bg-gray-100 text-gray-800',
};

const CONNECTION_COLORS: Record<string, string> = {
  workforce: 'bg-indigo-100 text-indigo-800',
  contractor: 'bg-amber-100 text-amber-800',
  external: 'bg-gray-100 text-gray-700',
};

// ── Main Component ──────────────────────────────────────────
// Auth is email/password (self-registration). This screen manages
// *app-level* authorization: role, isActive, isBeta, title. Users are
// created when they sign up on the login screen; the first account
// becomes sysadmin.
export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');

  const utils = trpc.useContext();
  const { data: userList = [], isLoading } = trpc.auth.listUsers.useQuery();

  const updateMutation = trpc.auth.updateUser.useMutation({
    onSuccess: () => utils.auth.listUsers.invalidate(),
  });

  // Filter users by name or email
  const filtered = userList.filter((user: any) => {
    const q = searchQuery.toLowerCase();
    return (
      (user.name ?? '').toLowerCase().includes(q) ||
      (user.email ?? '').toLowerCase().includes(q)
    );
  });

  const activeCount = userList.filter((u: any) => u.isActive).length;

  const handleToggleActive = (user: any) => {
    updateMutation.mutate({ id: user.id, isActive: !user.isActive });
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateMutation.mutate({ id: userId, role: role as any });
  };

  const handleBetaToggle = (userId: string, current: boolean) => {
    updateMutation.mutate({ id: userId, isBeta: !current });
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-900">
          New users are created when they sign up on the login screen. The first account becomes an admin.
          Use this screen to assign app-level roles and flags.
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {userList.length} total
        </div>
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          {activeCount} active
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery ? `No users matching "${searchQuery}"` : 'No users yet — sign up on the login screen to create the first user.'}
          </div>
        ) : (
          <table className="w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-3 w-10">Active</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3 w-[120px]">Connection</th>
                <th className="px-3 py-3 w-[120px]">Role</th>
                <th className="px-3 py-3 w-10">Beta</th>
                <th className="px-3 py-3">Timezone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user: any) => (
                <tr
                  key={user.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    !user.isActive ? 'opacity-50' : ''
                  }`}
                >
                  {/* Active */}
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={user.isActive}
                      onChange={() => handleToggleActive(user)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                  {/* Name (set at sign-up) */}
                  <td className="px-3 py-3 text-sm text-gray-900 font-medium">
                    {user.name ?? '—'}
                  </td>

                  {/* Email (set at sign-up) */}
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {user.email || '—'}
                  </td>

                  {/* Connection Type */}
                  <td className="px-3 py-3 text-xs">
                    {user.connectionType ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                        CONNECTION_COLORS[user.connectionType] || 'bg-gray-100'
                      }`}>
                        {user.connectionType}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Role */}
                  <td className="px-3 py-3 text-sm">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${
                        ROLE_COLORS[user.role] || 'bg-gray-100'
                      }`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </td>

                  {/* Beta */}
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={user.isBeta}
                      onChange={() => handleBetaToggle(user.id, user.isBeta)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                  {/* Timezone */}
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {user.timezone ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} className="text-gray-400" />
                        {user.timezone.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
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
