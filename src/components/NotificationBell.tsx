// ============================================================
// NOTIFICATION BELL — header component with dropdown panel
// Replicates RCDO NotificationBell pattern (DD-011)
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { trpc } from '../lib/trpc';

const TYPE_ICONS: Record<string, string> = {
  feedback_resolved: '✅',
  feedback_submitted: '📝',
  system: '⚙️',
  system_broadcast: '📢',
  mention: '💬',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useContext();

  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: notifications } = trpc.notifications.list.useQuery(undefined, {
    enabled: isOpen,
  });

  // Optimistic updates — matches RCDO pattern: update local cache immediately
  // instead of refetching, which avoids flash/disappear on mark-read
  const markReadMutation = trpc.notifications.markRead.useMutation({
    onMutate: async ({ id }) => {
      // Cancel any outgoing refetches so they don't overwrite optimistic update
      await utils.notifications.list.cancel();
      await utils.notifications.unreadCount.cancel();

      // Snapshot previous values
      const prevList = utils.notifications.list.getData();
      const prevCount = utils.notifications.unreadCount.getData();

      // Optimistically update: set readAt on the target notification
      utils.notifications.list.setData(undefined, (old: any) =>
        old?.map((n: any) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n)
      );
      utils.notifications.unreadCount.setData(undefined, (old: any) =>
        Math.max(0, (old ?? 1) - 1)
      );

      return { prevList, prevCount };
    },
    onError: (_err, _vars, context) => {
      // Roll back on error
      if (context?.prevList) utils.notifications.list.setData(undefined, context.prevList);
      if (context?.prevCount != null) utils.notifications.unreadCount.setData(undefined, context.prevCount);
    },
    onSettled: () => {
      // Re-sync with server in background
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onMutate: async () => {
      await utils.notifications.list.cancel();
      await utils.notifications.unreadCount.cancel();

      const prevList = utils.notifications.list.getData();
      const prevCount = utils.notifications.unreadCount.getData();

      // Mark all as read locally
      utils.notifications.list.setData(undefined, (old: any) =>
        old?.map((n: any) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
      utils.notifications.unreadCount.setData(undefined, 0);

      return { prevList, prevCount };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevList) utils.notifications.list.setData(undefined, context.prevList);
      if (context?.prevCount != null) utils.notifications.unreadCount.setData(undefined, context.prevCount);
    },
    onSettled: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const unreadCount = unreadData ?? 0;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 max-h-[480px] bg-white rounded-xl shadow-lg border border-gray-200 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <span className="font-semibold text-sm text-gray-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {!notifications || notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((n: any) => {
                const icon = TYPE_ICONS[n.type] || '🔔';
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.readAt) markReadMutation.mutate({ id: n.id });
                    }}
                    className={`px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors ${
                      n.readAt ? 'bg-white hover:bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${n.readAt ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                          <span className="mr-1">{icon}</span>
                          {n.message}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {timeAgo(n.createdAt)}
                          {n.type && ` · ${n.type.replace(/_/g, ' ')}`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
