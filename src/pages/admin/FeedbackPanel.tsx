import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { MessageSquare, Bug, Sparkles, HelpCircle, Image, RefreshCw } from 'lucide-react';
import AgentDiagnosisPanel from '../../components/admin/AgentDiagnosisPanel';
import AgentRunsView from '../../components/admin/AgentRunsView';

type Status = 'all' | 'open' | 'acknowledged' | 'in_progress' | 'pm_review' | 'approved' | 'resolved' | 'wont_fix';
type FeedbackType = 'all' | 'bug' | 'enhancement' | 'question' | 'business_process';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', pm_review: 'PM Review',
  approved: 'Approved', resolved: 'Resolved', wont_fix: "Won't Fix",
};

export default function FeedbackPanel() {
  const [selectedStatus, setSelectedStatus] = useState<Status>('all');
  const [selectedType, setSelectedType] = useState<FeedbackType>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRuns, setShowRuns] = useState(false);

  const utils = trpc.useContext();
  const { data } = trpc.feedbackAdmin.list.useQuery({});
  const allFeedback = data?.rows ?? [];
  const isLoading = !data;

  const { data: attachments } = trpc.feedbackAdmin.getAttachments.useQuery(
    { feedbackId: selectedFeedback?.id ?? '' },
    { enabled: !!selectedFeedback }
  );

  const refresh = () => utils.feedbackAdmin.list.invalidate();
  const updateMutation = trpc.feedbackAdmin.updateStatus.useMutation({
    onSuccess: (updated) => {
      refresh();
      setSelectedFeedback((prev: any) => prev ? { ...prev, adminNotes: updated?.adminNotes ?? prev.adminNotes, status: updated?.status ?? prev.status } : prev);
      setSaveMsg({ ok: true, text: 'Saved ✓' });
      setTimeout(() => setSaveMsg(null), 2500);
    },
    onError: (err) => setSaveMsg({ ok: false, text: 'Save failed: ' + (err?.message || 'unknown error') }),
  });

  // PM-review actions (G2 backend)
  const approveMut = trpc.feedbackApprove.approve.useMutation({
    onSuccess: () => { refresh(); setSelectedFeedback((p: any) => p ? { ...p, status: 'approved' } : p); },
    onError: (e) => alert('Approve failed: ' + e.message),
  });
  const dismissMut = trpc.feedbackApprove.dismiss.useMutation({
    onSuccess: () => { refresh(); setSelectedFeedback((p: any) => p ? { ...p, status: 'wont_fix' } : p); },
    onError: (e) => alert('Dismiss failed: ' + e.message),
  });
  const reopenMut = trpc.feedbackApprove.reopenFromReview.useMutation({
    onSuccess: () => { refresh(); setSelectedFeedback((p: any) => p ? { ...p, status: 'open' } : p); },
    onError: (e) => alert('Re-open failed: ' + e.message),
  });
  const pmBusy = approveMut.isLoading || dismissMut.isLoading || reopenMut.isLoading;

  const filtered = allFeedback.filter((item: any) => {
    const statusMatch = selectedStatus === 'all' || item.status === selectedStatus;
    const typeMatch = selectedType === 'all' || item.type === selectedType;
    return statusMatch && typeMatch;
  });

  const statusCounts: Record<string, number> = {
    all: allFeedback.length,
    open: allFeedback.filter((f: any) => f.status === 'open').length,
    in_progress: allFeedback.filter((f: any) => f.status === 'in_progress').length,
    pm_review: allFeedback.filter((f: any) => f.status === 'pm_review').length,
    approved: allFeedback.filter((f: any) => f.status === 'approved').length,
    resolved: allFeedback.filter((f: any) => f.status === 'resolved').length,
    wont_fix: allFeedback.filter((f: any) => f.status === 'wont_fix').length,
  };

  const typeIcons: Record<string, React.ReactNode> = {
    bug: <Bug size={16} className="text-red-600" />,
    enhancement: <Sparkles size={16} className="text-purple-600" />,
    question: <HelpCircle size={16} className="text-blue-600" />,
    business_process: <RefreshCw size={16} className="text-amber-600" />,
  };

  const statusBadgeColor: Record<string, string> = {
    open: 'bg-red-100 text-red-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    pm_review: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    resolved: 'bg-green-100 text-green-800',
    wont_fix: 'bg-gray-100 text-gray-800',
  };

  const handleStatusChange = (newStatus: any) => {
    if (selectedFeedback) {
      updateMutation.mutate({ id: selectedFeedback.id, status: newStatus });
      setSelectedFeedback({ ...selectedFeedback, status: newStatus });
    }
  };

  const handleSaveNotes = () => {
    if (selectedFeedback) updateMutation.mutate({ id: selectedFeedback.id, adminNotes });
  };

  const isAgentItem = selectedFeedback && (selectedFeedback.agentStatus || selectedFeedback.status === 'pm_review' || selectedFeedback.status === 'approved');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
      {/* Left: Filter Tabs & List */}
      <div className="lg:col-span-1 space-y-3">
        <button
          onClick={() => setShowRuns((v) => !v)}
          className={`w-full px-3 py-2 rounded-md text-sm font-medium border transition-colors ${showRuns ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
        >
          {showRuns ? '← Back to feedback' : 'View agent runs'}
        </button>

        {/* Status Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="space-y-2">
            {(['all', 'open', 'acknowledged', 'in_progress', 'pm_review', 'approved', 'resolved', 'wont_fix'] as Status[]).map((status) => (
              <button
                key={status}
                onClick={() => { setSelectedStatus(status); setSelectedFeedback(null); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedStatus === status ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                {status === 'all' ? 'All' : (STATUS_LABEL[status] ?? status)}{' '}
                <span className="text-xs font-normal ml-1">({statusCounts[status] ?? 0})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Type Filter */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-700 mb-2">Type</p>
          <div className="space-y-2">
            {(['all', 'bug', 'enhancement', 'question', 'business_process'] as FeedbackType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedType === type ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                {type === 'all' ? 'All' : type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback List */}
        <div className="bg-white rounded-lg border border-gray-200 flex-1 overflow-y-auto max-h-96 lg:max-h-none">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">No feedback found.</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filtered.map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => { setSelectedFeedback(item); setAdminNotes(item.adminNotes || ''); setShowRuns(false); }}
                  className={`w-full text-left px-3 py-3 hover:bg-gray-50 transition-colors border-l-4 ${
                    selectedFeedback?.id === item.id ? 'bg-blue-50 border-l-blue-500' : 'border-l-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="flex-shrink-0 mt-0.5">{typeIcons[item.type]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.submitterName}
                        {item.screenPath && <span className="ml-1 text-gray-400">on {item.screenPath}</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${statusBadgeColor[item.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                        {item.agentStatus && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">🤖 diagnosed</span>
                        )}
                        {!item.agentStatus && (item.aiReviewStatus === 'reviewed' || item.aiReviewStatus === 'completed') && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">AI</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Runs view OR Detail */}
      <div className="lg:col-span-2">
        {showRuns ? (
          <AgentRunsView />
        ) : selectedFeedback ? (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 h-full flex flex-col">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedFeedback.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">From: {selectedFeedback.submitterName}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${statusBadgeColor[selectedFeedback.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {STATUS_LABEL[selectedFeedback.status] ?? selectedFeedback.status}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {typeIcons[selectedFeedback.type]} {selectedFeedback.type.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </span>
                {selectedFeedback.screenPath && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    Page: {selectedFeedback.screenPath}
                  </span>
                )}
              </div>
            </div>

            {/* Severity + Scope */}
            {(selectedFeedback.severity || selectedFeedback.affectedScope) && (
              <div className="flex items-center gap-3 flex-wrap">
                {selectedFeedback.severity && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-500">Severity:</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      selectedFeedback.severity === 'blocking' ? 'bg-red-100 text-red-800' :
                      selectedFeedback.severity === 'annoying' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {selectedFeedback.severity.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                {selectedFeedback.affectedScope && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-500">Affects:</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {selectedFeedback.affectedScope === 'just_me' ? '👤 Just me' :
                       selectedFeedback.affectedScope === 'my_team' ? '👥 My team' :
                       selectedFeedback.affectedScope === 'everyone' ? '🏢 Everyone' :
                       selectedFeedback.affectedScope}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Description</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedFeedback.description}</p>
            </div>

            {/* AI Review Results */}
            {selectedFeedback.aiReviewStatus === 'completed' && (selectedFeedback.aiTitle || selectedFeedback.aiPriority) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-700 mb-2">AI Review</p>
                {selectedFeedback.aiPriority && (
                  <p className="text-xs text-blue-600 mb-1">Priority: <span className="font-medium">{selectedFeedback.aiPriority}</span></p>
                )}
                {selectedFeedback.aiTitle && selectedFeedback.aiTitle !== selectedFeedback.title && (
                  <p className="text-xs text-blue-600">Suggested title: <span className="font-medium">{selectedFeedback.aiTitle}</span></p>
                )}
              </div>
            )}

            {/* Screenshot */}
            {attachments && attachments.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1"><Image size={12} /> Screenshot</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <img src={attachments[0].imageData ?? ''} alt="User screenshot" className="w-full h-auto" />
                </div>
              </div>
            )}

            {/* Agent diagnosis cockpit */}
            {isAgentItem && (
              <AgentDiagnosisPanel
                adminNotes={selectedFeedback.adminNotes}
                agentDiagnosis={selectedFeedback.agentDiagnosis}
                agentStatus={selectedFeedback.agentStatus}
                agentPrUrl={selectedFeedback.agentPrUrl}
              />
            )}

            {/* PM-review actions — only for pm_review items */}
            {selectedFeedback.status === 'pm_review' && (
              <div className="flex gap-2">
                <button
                  onClick={() => approveMut.mutate({ id: selectedFeedback.id })}
                  disabled={pmBusy}
                  className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-md"
                >
                  {approveMut.isLoading ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => dismissMut.mutate({ id: selectedFeedback.id, note: prompt('Dismiss reason (optional):') || undefined })}
                  disabled={pmBusy}
                  className="px-3 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-md"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => reopenMut.mutate({ id: selectedFeedback.id })}
                  disabled={pmBusy}
                  className="px-3 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sky-700 text-sm font-medium rounded-md"
                >
                  Re-open
                </button>
              </div>
            )}

            {/* Admin Notes */}
            <div className="flex-1 flex flex-col">
              <p className="text-xs font-medium text-gray-700 mb-2">Admin Notes</p>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add notes here..."
                className="flex-1 p-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={handleSaveNotes}
                disabled={updateMutation.isLoading}
                className="mt-2 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
              >
                {updateMutation.isLoading ? 'Saving...' : 'Save Notes'}
              </button>
            </div>

            {saveMsg && (
              <p className={`text-xs mb-1 ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{saveMsg.text}</p>
            )}
            {/* Status Change Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-200">
              <button onClick={() => handleStatusChange('in_progress')} className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-900 text-sm font-medium rounded-md transition-colors">In Progress</button>
              <button onClick={() => handleStatusChange('resolved')} className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-900 text-sm font-medium rounded-md transition-colors">Resolve</button>
              <button onClick={() => handleStatusChange('open')} className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-900 text-sm font-medium rounded-md transition-colors">Reopen</button>
              <button onClick={() => handleStatusChange('wont_fix')} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium rounded-md transition-colors">Won't Fix</button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 h-full flex items-center justify-center">
            <div>
              <MessageSquare size={40} className="mx-auto text-gray-400 mb-2" />
              <p>Select a feedback item to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
