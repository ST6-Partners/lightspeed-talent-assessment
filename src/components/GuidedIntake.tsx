// ============================================================
// GUIDED INTAKE — adaptive intake interview embedded in the form.
//
// Runs a short conversation that asks the hiring manager one probing
// question at a time and extracts concrete role-profile field values.
// Captures accumulate as "pending"; "Use these answers" writes them
// into the form via onApply. The per-field Help-me-write helper is
// unaffected. Same bias guardrails as the sharpen helper (server-side).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Sparkles, User, AlertTriangle, Check, Lock, X } from 'lucide-react';
import { trpc } from '../lib/trpc';

const FIELDS: { id: string; label: string }[] = [
  { id: 'mustHaves', label: 'Must-haves' },
  { id: 'niceToHaves', label: 'Nice-to-haves' },
  { id: 'standoutSignals', label: 'Stand-out signals' },
  { id: 'dealbreakers', label: 'Dealbreakers' },
  { id: 'thriveProfile', label: 'Who thrives' },
  { id: 'struggleProfile', label: 'Who struggles' },
  { id: 'teamContext', label: 'Team context' },
];

type Turn = { role: 'assistant' | 'user'; text: string };

export default function GuidedIntake({
  roleContext,
  fields,
  onApply,
  onClose,
}: {
  roleContext: string;
  fields: Record<string, string>;
  onApply: (updates: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const turn = trpc.intake.interviewTurn.useMutation();

  const effective: Record<string, string> = { ...fields, ...pending };

  async function runTurn(nextTranscript: Turn[]) {
    const res = await turn.mutateAsync({
      roleContext,
      fields: effective,
      transcript: nextTranscript,
    });
    setPending((p) => {
      const merged = { ...p };
      for (const c of res.captures) merged[c.field] = c.value;
      return merged;
    });
    setTarget(res.targetField);
    setDone(res.done);
    setTranscript([...nextTranscript, { role: 'assistant', text: res.message }]);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runTurn([]).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [transcript, turn.isLoading]);

  const send = () => {
    const text = answer.trim();
    if (!text || turn.isLoading) return;
    setAnswer('');
    runTurn([...transcript, { role: 'user', text }]).catch(() => {});
  };

  const pendingCount = Object.keys(pending).length;
  const filledCount = FIELDS.filter((f) => (effective[f.id] ?? '').trim()).length;

  return (
    <div className="border border-ls-primary-50 bg-ls-primary-50/40 rounded-lg p-4 mb-4">
      {/* header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-ls-primary" />
          <div>
            <div className="text-sm font-semibold text-ls-ink">Guided intake</div>
            <div className="text-[11px] text-ls-ink-3">{filledCount} of {FIELDS.length} fields filled</div>
          </div>
        </div>
        <button onClick={onClose} className="text-ls-ink-3 hover:text-ls-ink p-1" title="Close">
          <X size={16} />
        </button>
      </div>

      {/* coverage chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FIELDS.map((f) => {
          const filled = (effective[f.id] ?? '').trim().length > 0;
          const isNow = target === f.id;
          const cls = isNow
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : filled
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-white text-gray-400 border-gray-200';
          return (
            <span key={f.id} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>
              {filled && !isNow && <Check size={11} />}
              {f.label}
            </span>
          );
        })}
      </div>

      {/* conversation */}
      <div ref={scroller} className="max-h-64 overflow-y-auto pr-1 mb-3">
        {transcript.map((t, i) => (
          <div key={i} className={`flex gap-2 mb-2.5 ${t.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${t.role === 'user' ? 'bg-white text-ls-ink-3 border border-gray-200' : 'bg-blue-50 text-ls-primary'}`}>
              {t.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
            </div>
            <div className={`max-w-[80%] text-[13px] leading-relaxed px-3 py-2 rounded-xl ${t.role === 'user' ? 'bg-blue-50 text-blue-900' : 'bg-white text-ls-ink border border-gray-100'}`}>
              {t.text}
            </div>
          </div>
        ))}
        {turn.isLoading && (
          <div className="flex gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-blue-50 text-ls-primary"><Sparkles size={14} /></div>
            <div className="text-[13px] text-ls-ink-3 px-3 py-2">thinking…</div>
          </div>
        )}
      </div>

      {/* captured-so-far preview */}
      {pendingCount > 0 && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-green-700 mb-1">
            <Check size={13} /> Captured {pendingCount} field{pendingCount > 1 ? 's' : ''} — not yet added to the form
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(pending).map((id) => (
              <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-green-200 text-green-800">
                {FIELDS.find((f) => f.id === id)?.label ?? id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* input */}
      {!done && (
        <div className="flex gap-2 items-center">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
            placeholder="Type the manager's answer…"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          />
          <button onClick={send} disabled={turn.isLoading || !answer.trim()}
            className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50">
            Send
          </button>
        </div>
      )}
      {done && (
        <div className="text-[13px] text-ls-ink-2 bg-white border border-gray-100 rounded-md px-3 py-2">
          That's enough to work with. Review the captured answers and add them to the form.
        </div>
      )}

      {/* footer: guardrail + apply */}
      <div className="flex items-start justify-between gap-3 border-t border-ls-line mt-3 pt-3">
        <div className="flex items-start gap-1.5 max-w-[60%]">
          <Lock size={13} className="text-ls-ink-3 mt-0.5 shrink-0" />
          <span className="text-[11px] text-ls-ink-3 leading-snug">
            Stays job-relevant. Never asks about personality, culture fit, or anything that could proxy for a protected trait. Every field stays editable.
          </span>
        </div>
        <button
          onClick={() => { if (pendingCount) { onApply(pending); setPending({}); } }}
          disabled={pendingCount === 0}
          className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-40 whitespace-nowrap">
          Use these answers
        </button>
      </div>
    </div>
  );
}
