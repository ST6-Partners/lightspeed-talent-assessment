// ============================================================
// LAYOUT — Lightspeed-branded shell: slate sidebar + topbar
// Auth guard: redirects to /login if not authenticated
// ============================================================

import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Settings, MessageSquare, LogOut, Bot, Users, FileText, ClipboardList, BarChart2, Award, ClipboardCheck, FileCheck, Building2, Tag, Contact, Library, Megaphone, UserCheck, Video, ShieldCheck, ClipboardPen, Brain, CheckSquare, Database, ArrowLeft } from 'lucide-react';
import NotificationBell from './NotificationBell';
import FeedbackDrawer from './FeedbackDrawer';
import ChatDrawer from './ChatDrawer';
import WhatsNew from './WhatsNew';
import { trpc } from '../lib/trpc';

const topNav = [
  { path: '/hiring/metrics', label: 'Metrics', icon: BarChart2 },
];

const talentNav = [
  { path: '/hiring/intake', label: 'Intake', icon: ClipboardPen },
  { path: '/hiring/requisitions', label: 'Requisitions', icon: ClipboardList },
  { path: '/hiring/postings', label: 'Open Roles', icon: Megaphone },
  { path: '/hiring/candidates', label: 'Candidates', icon: Users },
  { path: '/hiring/review', label: 'Review', icon: ClipboardCheck },
  { path: '/hiring/internal', label: 'Internal Pipeline', icon: UserCheck },
  { path: '/hiring/assessments', label: 'Assessments', icon: Brain },
  { path: '/hiring/tasks', label: 'Work Sample', icon: Library },
  { path: '/hiring/scorecards', label: 'Scorecards', icon: CheckSquare },
  { path: '/hiring/interviews', label: 'Interviews', icon: Video },
];

const fairnessNav = { path: '/hiring/fairness', label: 'Bias', icon: ShieldCheck };

// Individual core-data pages. These are no longer listed one-by-one in the
// sidebar — they're reached through the single Core Data hub link below,
// which opens a landing page of cards. Kept here so breadcrumbs still
// resolve each page's label.
const coreNav = [
  { path: '/hiring/employees', label: 'Employees', icon: Contact },
  { path: '/hiring/departments', label: 'Departments', icon: Building2 },
  { path: '/hiring/titles', label: 'Titles', icon: Tag },
  { path: '/hiring/values', label: 'Company Values', icon: Award },
  { path: '/hiring/jobs', label: 'Job Descriptions', icon: FileText },
];

const coreDataLink = { path: '/hiring/core-data', label: 'Core Data', icon: Database };

const LS_MARK_URL = 'https://www.lightspeedsystems.com/wp-content/uploads/2024/12/favicon.svg';
// Official Lightspeed mark, painted in brand blue via CSS mask so it shows on the
// dark navy sidebar (the source SVG's own fill is ignored).
function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div
      role="img"
      aria-label="Lightspeed"
      style={{
        width: Math.round(size * 0.84),
        height: size,
        backgroundColor: '#4EABD2',
        WebkitMaskImage: `url(${LS_MARK_URL})`,
        maskImage: `url(${LS_MARK_URL})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

const allNav = [...topNav, ...talentNav, fairnessNav, coreDataLink, ...coreNav];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const timezoneMutation = trpc.auth.updateTimezone.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    localStorage.removeItem('auth_token');
    try { await logoutMutation.mutateAsync(); } catch { /* redirect regardless */ }
    window.location.href = '/login';
  };

  useEffect(() => {
    if (!isLoading && !user) navigate('/login', { replace: true });
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) timezoneMutation.mutate({ timezone: tz });
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ls-bg">
        <div className="text-sm text-ls-ink-3">Loading…</div>
      </div>
    );
  }

  const isAdmin = ['admin', 'sysadmin'].includes(user.role);
  const crumb = allNav.find((n) => n.path === location.pathname)?.label
    ?? (location.pathname.startsWith('/hiring') ? 'Hiring' : 'Home');
  // On a Core Data sub-page, offer a way back to the Core Data hub.
  const isCoreSubpage = coreNav.some((n) => n.path === location.pathname);

  const renderLink = (item: { path: string; label: string; icon: any }) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`flex items-center gap-3 px-3 py-2 rounded-[9px] text-sm font-medium mb-0.5 transition-colors ${
          isActive
            ? 'ls-accent-grad text-white shadow-[0_4px_14px_rgba(79,169,214,.3)]'
            : 'text-[#B9C3CB] hover:bg-ls-slate-2 hover:text-white'
        }`}
      >
        <Icon size={18} className={isActive ? 'opacity-100' : 'opacity-85'} />
        {item.label}
      </Link>
    );
  };

  return (
    // Fixed viewport height + hidden overflow so the sidebar nav and the main
    // content each scroll on their own, instead of the whole page scrolling as one.
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-ls-slate text-[#B9C3CB] flex flex-col px-3.5 py-4">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <BrandMark size={42} />
          <div className="leading-tight">
            <div className="text-white font-bold text-[15px] tracking-tight leading-[1.12]">Lightspeed<br/>Systems</div>
            <div className="text-[11px] text-[#7E8B94] mt-1">Talent Assessment</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto">
          {topNav.map(renderLink)}
          {isAdmin && renderLink(fairnessNav)}
          {renderLink(coreDataLink)}

          <div className="px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[.12em] text-[#677480]">Talent Acquisition</div>
          {talentNav.map(renderLink)}
        </nav>

        <div className="mt-auto border-t border-[#36424B] pt-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full ls-accent-grad text-white flex items-center justify-center text-xs font-bold">
              {user.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#E3E7EA] truncate">{user.name}</div>
              <div className="text-[11px] text-[#7E8B94]">{user.role}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-ls-bg">
        <header className="h-14 bg-white/70 backdrop-blur border-b border-ls-line flex items-center justify-between px-6">
          <div className="text-[13px] text-ls-ink-3 flex items-center gap-1.5">
            {isCoreSubpage && (
              <>
                <Link
                  to={coreDataLink.path}
                  className="inline-flex items-center gap-1 text-ls-ink-3 hover:text-ls-primary transition-colors"
                >
                  <ArrowLeft size={15} /> Core Data
                </Link>
                <span className="text-ls-ink-3/60">/</span>
              </>
            )}
            <span className="text-ls-ink font-semibold">{crumb}</span>
          </div>
          <div className="flex items-center gap-2">
            <WhatsNew />
            <NotificationBell />
            <button
              onClick={() => setShowChat(true)}
              title="AI Assistant"
              className="p-2 text-ls-ink-3 hover:text-ls-ink rounded-lg hover:bg-ls-bg-2 transition-colors"
            >
              <Bot className="w-5 h-5" />
            </button>
            {['admin', 'sysadmin'].includes((user as any)?.role) && (
              <Link to="/admin/settings" title="Settings" className="p-2 text-ls-ink-3 hover:text-ls-ink rounded-lg hover:bg-ls-bg-2 transition-colors">
                <Settings className="w-5 h-5" />
              </Link>
            )}
            <button
              onClick={() => setShowFeedback(true)}
              className="p-2 text-ls-ink-3 hover:text-ls-ink rounded-lg hover:bg-ls-bg-2 transition-colors"
              title="Submit Feedback"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-ls-ink-3 hover:text-ls-ink rounded-lg hover:bg-ls-bg-2 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      <FeedbackDrawer open={showFeedback} onClose={() => setShowFeedback(false)} />
      <ChatDrawer open={showChat} onClose={() => setShowChat(false)} screenMode={crumb} />
    </div>
  );
}
