// ============================================================
// FEEDBACK AI REVIEW PANEL — the "Check with AI" step (Contract v1.0 §5)
// Signal parity: shows answer_source on the "answer" outcome.
// ============================================================

import { CheckCircle2, Copy, HelpCircle, Send, X } from 'lucide-react';

export interface AIReviewResult {
  reviewAttemptId: string;
  fallbackUsed: boolean;
  outcome: 'ready_to_file' | 'answer' | 'duplicate' | 'needs_info';
  cleanedTitle: string;
  aiDescription: string;
  priority: 'high' | 'medium' | 'low' | 'unset';
  priorityReasoning: string;
  severity: 'sev1' | 'sev2' | 'sev3' | 'unset';
  answer: string | null;
  answerSource: string | null;
  duplicateOfId: string | null;
  needsInfoPrompt: string | null;
  matches: { id: string; title: string; why: string }[];
}

interface Props {
  review: AIReviewResult;
  onSubmitAnyway: () => void;
  onResolve: (reason: 'answered' | 'duplicate' | 'abandoned') => void;
  onEdit: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800', unset: 'bg-gray-100 text-gray-600',
};

export default function FeedbackAIReviewPanel({ review, onSubmitAnyway, onResolve, onEdit }: Props) {
  return (
    <div className="space-y-4">
      {review.fallbackUsed && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          AI review is unavailable right now — you can still submit your feedback below.
        </div>
      )}

      {review.outcome === 'answer' && review.answer && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-800 font-medium text-sm mb-2">
            <CheckCircle2 className="w-4 h-4" /> We may already have an answer
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.answer}</p>
          {review.answerSource && (
            <p className="text-xs text-gray-500 mt-2">Source: {review.answerSource}</p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={() => onResolve('answered')} className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700">That answers it</button>
            <button onClick={onSubmitAnyway} className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-white">Submit anyway</button>
          </div>
        </div>
      )}

      {review.outcome === 'duplicate' && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-800 font-medium text-sm mb-2">
            <Copy className="w-4 h-4" /> This looks like an existing item
          </div>
          {review.matches.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {review.matches.map((m) => (
                <li key={m.id} className="text-sm text-gray-700"><span className="font-medium">{m.title}</span><span className="text-gray-500"> — {m.why}</span></li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button onClick={() => onResolve('duplicate')} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Follow the existing one</button>
            <button onClick={onSubmitAnyway} className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-white">It's different — submit</button>
          </div>
        </div>
      )}

      {review.outcome === 'needs_info' && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-2">
            <HelpCircle className="w-4 h-4" /> A bit more detail would help
          </div>
          <p className="text-sm text-gray-700">{review.needsInfoPrompt}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={onEdit} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700">Add detail</button>
            <button onClick={onSubmitAnyway} className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-white">Submit as-is</button>
          </div>
        </div>
      )}

      {review.outcome === 'ready_to_file' && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-800 font-medium text-sm mb-2"><Send className="w-4 h-4" /> Ready to submit</div>
          <div className="space-y-2 text-sm">
            <div><span className="text-xs text-gray-400 uppercase tracking-wide">Suggested title</span><p className="text-gray-900">{review.cleanedTitle}</p></div>
            {review.aiDescription && <div><span className="text-xs text-gray-400 uppercase tracking-wide">Cleaned description</span><p className="text-gray-700 whitespace-pre-wrap">{review.aiDescription}</p></div>}
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[review.priority]}`}>priority: {review.priority}</span>
              <span className="text-xs text-gray-400">{review.priorityReasoning}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={onSubmitAnyway} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">Submit feedback</button>
            <button onClick={onEdit} className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-white">Edit first</button>
          </div>
        </div>
      )}

      {review.outcome !== 'ready_to_file' && review.outcome !== 'needs_info' && (
        <button onClick={onEdit} className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1"><X className="w-3 h-3" /> Back to edit</button>
      )}
    </div>
  );
}
