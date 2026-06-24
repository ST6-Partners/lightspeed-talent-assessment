// ============================================================
// FEEDBACK DRAWER — submit feedback + pre-submit AI review (SC-002)
// Signal parity: up to 5 screenshots (auto-capture + paste + drop),
// severity required for bugs, and the "Check with AI" review step.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Camera, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { trpc } from '../lib/trpc';
import FeedbackAIReviewPanel, { AIReviewResult } from './FeedbackAIReviewPanel';
import AgentDiagnosisPanel from './admin/AgentDiagnosisPanel';

const MAX_SHOTS = 5;

const TYPE_OPTIONS = [
  { value: 'bug', label: 'Bug', icon: '🐛' },
  { value: 'enhancement', label: 'Enhancement', icon: '✨' },
  { value: 'question', label: 'Question', icon: '❓' },
  { value: 'business_process', label: 'Business Process', icon: '🔄' },
];
const SEVERITY_OPTIONS = [
  { value: 'blocking', label: 'Blocking', color: 'bg-red-100 text-red-800' },
  { value: 'annoying', label: 'Annoying', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'nice_to_have', label: 'Nice-to-have', color: 'bg-green-100 text-green-800' },
];
const SCOPE_OPTIONS = [
  { value: 'just_me', label: 'Just me', icon: '👤' },
  { value: 'my_team', label: 'My team', icon: '👥' },
  { value: 'everyone', label: 'Everyone', icon: '🏢' },
];
const STATUS_LABELS: Record<string, string> = {
  open: 'Submitted', acknowledged: "We've seen this", in_progress: 'Working on it',
  pm_review: 'In review', approved: 'Fix approved', resolved: 'Fixed', wont_fix: "Won't change",
};

interface FeedbackDrawerProps { open: boolean; onClose: () => void; }

export default function FeedbackDrawer({ open, onClose }: FeedbackDrawerProps) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'new' | 'submissions'>('new');
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('');
  const [affectedScope, setAffectedScope] = useState('');
  const [toast, setToast] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [review, setReview] = useState<AIReviewResult | null>(null);
  const hasCapturedRef = useRef(false);

  const addShot = (dataUrl: string) =>
    setScreenshots((prev) => (prev.length >= MAX_SHOTS ? prev : [...prev, dataUrl]));

  const capture = async () => {
    if (screenshots.length >= MAX_SHOTS) return;
    setIsCapturing(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const canvas = await html2canvas(document.body, {
        logging: false, useCORS: true, scale: 0.5,
        ignoreElements: (el) => el.closest?.('.feedback-drawer-panel') !== null,
      });
      addShot(canvas.toDataURL('image/png'));
    } catch (err) { console.warn('Screenshot capture failed:', err); }
    finally { setIsCapturing(false); }
  };

  // Auto-capture once when the drawer opens.
  useEffect(() => {
    if (!open) { hasCapturedRef.current = false; return; }
    if (hasCapturedRef.current) return;
    hasCapturedRef.current = true;
    capture();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paste an image (Ctrl/Cmd-V) to add a screenshot.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => typeof reader.result === 'string' && addShot(reader.result);
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' && addShot(reader.result);
        reader.readAsDataURL(file);
      }
    });
  };

  const submitMutation = trpc.feedbackAdmin.submit.useMutation({
    onSuccess: () => {
      setToast('Feedback submitted!');
      setType(''); setTitle(''); setDescription(''); setSeverity(''); setAffectedScope('');
      setScreenshots([]); setReview(null);
      setTimeout(() => setToast(''), 3000);
    },
    onError: () => { setToast('Failed to submit feedback'); setTimeout(() => setToast(''), 3000); },
  });

  const reviewMutation = trpc.feedbackReview.review.useMutation({ onSuccess: (r) => setReview(r as AIReviewResult) });
  const dismissMutation = trpc.feedbackReview.dismiss.useMutation();
  const { data: myFeedback, refetch: refetchMine } = trpc.feedbackAdmin.mySubmissions.useQuery(undefined, {
    enabled: open && activeTab === 'submissions',
  });
  const reopenMineMutation = trpc.feedbackAdmin.reopenMine.useMutation({ onSuccess: () => refetchMine() });

  // Severity is required for bugs (Signal parity).
  const canProceed = !!type && !!title.trim() && (type !== 'bug' || !!severity);

  const handleCheck = () => {
    if (!canProceed) return;
    reviewMutation.mutate({ type, title, description, severity: severity || undefined, screenPath: location.pathname });
  };

  const handleSubmit = () => {
    if (!canProceed) return;
    submitMutation.mutate({
      type, title, description,
      severity: severity || undefined,
      affectedScope: affectedScope || undefined,
      screenPath: location.pathname,
      screenshots: screenshots.length ? screenshots : undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="feedback-drawer-panel relative w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Feedback</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-gray-200">
          <button onClick={() => setActiveTab('new')} className={`flex-1 px-4 py-2.5 text-sm font-medium ${activeTab === 'new' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>New Feedback</button>
          <button onClick={() => setActiveTab('submissions')} className={`flex-1 px-4 py-2.5 text-sm font-medium ${activeTab === 'submissions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>My Submissions</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'new' ? (
            <div className="space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
                <div className="flex gap-2 flex-wrap">
                  {TYPE_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setType(opt.value)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${type === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                      <span>{opt.icon}</span>{opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              {/* Severity — required for bugs */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Severity {type === 'bug' && <span className="text-red-500">*</span>}
                </label>
                <div className="flex gap-2">
                  {SEVERITY_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setSeverity(opt.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${severity === opt.value ? `${opt.color} border-current` : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>{opt.label}</button>
                  ))}
                </div>
                {type === 'bug' && !severity && <p className="text-[11px] text-red-500 mt-1">Pick a severity for bugs.</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened? What did you expect?" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
              </div>

              {/* Who's affected */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Who's affected?</label>
                <div className="flex gap-2">
                  {SCOPE_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setAffectedScope(opt.value)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${affectedScope === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}><span>{opt.icon}</span>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Screenshots — up to 5, capture + paste + drop */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Screenshots ({screenshots.length}/{MAX_SHOTS})</label>
                {screenshots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {screenshots.map((src, i) => (
                      <div key={i} className="border border-gray-200 rounded-md overflow-hidden relative group">
                        <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-16 object-cover" />
                        <button onClick={() => setScreenshots((p) => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 p-1 bg-white/90 rounded text-red-500 opacity-0 group-hover:opacity-100" title="Remove"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                {screenshots.length < MAX_SHOTS && (
                  <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()} className="border border-dashed border-gray-300 rounded-lg p-3 text-xs text-gray-400 hover:border-gray-400 transition-colors flex items-center justify-center gap-2">
                    <button onClick={capture} disabled={isCapturing} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700">
                      <Camera className="w-3.5 h-3.5" />{isCapturing ? 'Capturing…' : 'Capture'}
                    </button>
                    <span className="text-gray-300">·</span>
                    <span>drop or paste (Ctrl/Cmd-V)</span>
                  </div>
                )}
              </div>

              {/* AI review step / Check with AI */}
              {review ? (
                <FeedbackAIReviewPanel
                  review={review}
                  onSubmitAnyway={() => { handleSubmit(); setReview(null); }}
                  onResolve={(reason) => { dismissMutation.mutate({ reviewAttemptId: review.reviewAttemptId, reason }); setReview(null); onClose(); }}
                  onEdit={() => setReview(null)}
                />
              ) : (
                <button onClick={handleCheck} disabled={!canProceed || reviewMutation.isLoading} className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {reviewMutation.isLoading ? 'Checking with AI…' : 'Check with AI'}
                </button>
              )}

              {toast && <div className={`text-sm text-center py-2 rounded-lg ${toast.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{toast}</div>}
            </div>
          ) : (
            <div className="space-y-3">
              {!myFeedback || myFeedback.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8">No submissions yet</div>
              ) : (
                myFeedback.map((fb: any) => (
                  <div key={fb.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{TYPE_OPTIONS.find((t) => t.value === fb.type)?.icon} {fb.title}</div>
                        {fb.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{fb.description}</div>}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 bg-gray-100 text-gray-700">{STATUS_LABELS[fb.status] || fb.status}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">{new Date(fb.createdAt).toLocaleDateString()}</div>
                    {(fb.agentDiagnosis || fb.adminNotes) && ['pm_review','approved','resolved'].includes(fb.status) && (
                      <div className="mt-2"><AgentDiagnosisPanel adminNotes={fb.adminNotes} agentDiagnosis={fb.agentDiagnosis} agentStatus={fb.agentStatus} agentPrUrl={fb.agentPrUrl} /></div>
                    )}
                    {['resolved','wont_fix','approved'].includes(fb.status) && (
                      <button onClick={() => reopenMineMutation.mutate({ id: fb.id })} disabled={reopenMineMutation.isLoading} className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">This isn't resolved — reopen</button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
