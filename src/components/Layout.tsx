// ============================================================
// LAYOUT — sidebar + top bar with NotificationBell + FeedbackDrawer
// Auth guard: redirects to /login if not authenticated
// ============================================================

import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Database, Settings, MessageSquare, LogOut, Bot } from 'lucide-react';
import NotificationBell from './NotificationBell';
import FeedbackDrawer from './FeedbackDrawer';
import WhatsNew from './WhatsNew';
import { trpc } from '../lib/trpc';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/entities', label: 'Entities', icon: Database },
  { path: '/chat', label: 'AI Chat', icon: Bot },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showFeedback, setShowFeedback] = useState(false);

  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const timezoneMutation = trpc.auth.updateTimezone.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    // Clear BOTH auth channels: the localStorage bearer token (primary path
    // in the Replit iframe) and the server-side session + cookie (first-party
    // path). The tRPC logout destroys req.session and clears tmpl.sid.
    localStorage.removeItem('auth_token');
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignore — we redirect to /login regardless
    }
    window.location.href = '/login';
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [isLoading, user, navigate]);

  // Sync browser timezone on every app load
  useEffect(() => {
    if (user) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) timezoneMutation.mutate({ timezone: tz });
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-700">
          <h1 className="text-lg font-semibold text-white">Template App</h1>
          <p className="text-xs text-gray-400 mt-1">SP-002 Scaffold</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white font-medium'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {user && (
          <div className="px-4 py-3 border-t border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs font-medium">
                {user.name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-200 truncate">{user.name}</div>
                <div className="text-[10px] text-gray-500">{user.role}</div>
              </div>
            </div>
          </div>
        )}
        <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
          v0.1.0
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div />
          <div className="flex items-center gap-2">
            <WhatsNew />
            <NotificationBell />
            <button
              onClick={() => setShowFeedback(true)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="Submit Feedback"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Feedback drawer */}
      <FeedbackDrawer open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  );
}
