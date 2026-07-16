// ============================================================
// INTERVIEWS TAB — clean per-round workspace.
// Structure: candidate search → candidate header + 3 stats →
// one self-contained card per round (interviewer, schedule, prep +
// briefing, transcript → feedback all inside the card) → add/seed row
// → a collapsed candidate self-scheduling (Calendly) section → a single
// auto-generated-questions line.
// ============================================================

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Search, Plus, Trash2, Pencil, X, XCircle } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { SchedulingSection } from './Candidates';

const STATUS_STYLE: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
};
const FOLLOW_LABEL: Record<string, string> = { avoided: 'Avoided', half_answered: 'Half-answered', suggested: 'Suggested' };
// Interviews tab only surfaces candidates at the interview stage or beyond.
const INTERVIEW_STAGES = ['Interview Scheduled', 'Interviewed', 'Offered', 'Hired'];
// Managers want all of a candidate's rounds held inside a tight window so the
// panel compares people while they're fresh (manager-meeting decision).
const INTERVIEW_WINDOW_HOURS = 48;
const fmtSpan = (h: number) => (h < 48 ? `${h}h` : `${(h / 24).toFixed(1)} days`);
const FOLLOW_TYPES: { value: 'avoided' | 'half_answered' | 'suggested'; label: string }[] = [
  { value: 'avoided', label: 'Avoided' },
  { value: 'half_answered', label: 'Half-answered' },
  { value: 'suggested', label: 'Suggested' },
];
// Elapsed hours between two instants, counting weekdays only (weekends excluded),
// matching the server's 48-business-hour interview window rule.
function businessHoursBetween(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const STEP = 15 * 60 * 1000;
  let ms = 0;
  for (let t = startMs; t < endMs; t += STEP) {
    const day = new Date(t).getDay();
    if (day !== 0 && day !== 6) ms += Math.min(STEP, endMs - t);
  }
  return ms / 3_600_000;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function RoundCard({ round, defaultOpen, onChanged, reviews, valueName, questions, standardQuestions }: { round: any; defaultOpen: boolean; onChanged: () => void; reviews: any[]; valueName: Record<string, string>; questions: any[]; standardQuestions: any[] }) {
  const [open, setOpen] = useState(defaultOpen);
  const [transcript, setTranscript] = useState('');
  const [showBriefing, setShowBriefing] = useState(false);
  const [briefOpen, setBriefOpen] = useState<Record<string, boolean>>({});
  const [fbOpen, setFbOpen] = useState(false);
  const [fbEdit, setFbEdit] = useState(false);
  const [draftRead, setDraftRead] = useState('');
  const [draftFus, setDraftFus] = useState<any[]>([]);

  const update = trpc.interviews.updateRound.useMutation({ onSuccess: onChanged, onError: (err) => { alert(err.message); onChanged?.(); } });
  const remove = trpc.interviews.removeRound.useMutation({ onSuccess: onChanged });
  const record = trpc.interviews.recordFeedback.useMutation({ onSuccess: onChanged });
  const saveFb = trpc.interviews.updateFeedback.useMutation({ onSuccess: () => { setFbEdit(false); onChanged(); } });

  const startEditFb = () => {
    setDraftRead(round.feedbackHr ?? '');
    setDraftFus((Array.isArray(round.followUps) ? round.followUps : []).map((f: any) => ({ type: f.type, text: f.text })));
    setFbEdit(true);
    setFbOpen(true);
  };
  const sendPrep = trpc.interviews.sendPrep.useMutation({ onSuccess: onChanged });
  const briefing = trpc.interviews.briefing.useQuery({ id: round.id }, { enabled: showBriefing });

  const fus = Array.isArray(round.followUps) ? round.followUps : [];
  const accent = round.status !== 'completed';
  const roundReviews = (reviews ?? []).filter((rv: any) => rv.interviewId === round.id);

  return (
    <div className={`border rounded-xl overflow-hidden ${accent ? 'border-blue-200' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 w-full text-left px-4 py-3 ${accent ? 'bg-blue-50' : 'bg-white'}`}
      >
        {open ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
        <span className="text-sm font-semibold text-gray-800 truncate">{round.roundName}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[round.status] ?? STATUS_STYLE.planned}`}>{round.status}</span>
        {!open && round.interviewerName && <span className="text-xs text-gray-500 truncate">{round.interviewerName}</span>}
        <span className="ml-auto text-xs text-gray-500 shrink-0">{round.score != null ? `score ${round.score}` : (round.prepSentAt ? 'prep emailed' : '')}</span>
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-gray-100 space-y-3">
          {/* Interviewer + schedule */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Interviewer</div>
              <input defaultValue={round.interviewerName ?? ''} placeholder="Name"
                onBlur={(e) => e.target.value !== (round.interviewerName ?? '') && update.mutate({ id: round.id, interviewerName: e.target.value || null })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Interviewer email</div>
              <input defaultValue={round.interviewerEmail ?? ''} placeholder="email@company.com"
                onBlur={(e) => e.target.value !== (round.interviewerEmail ?? '') && update.mutate({ id: round.id, interviewerEmail: e.target.value || null })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <div className="text-[11px] text-gray-500 mb-1">Scheduled time</div>
              <input type="datetime-local"
                defaultValue={round.scheduledAt ? new Date(round.scheduledAt).toISOString().slice(0, 16) : ''}
                onBlur={(e) => update.mutate({ id: round.id, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null, status: e.target.value && round.status === 'planned' ? 'scheduled' : undefined })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <button onClick={() => remove.mutate({ id: round.id })} className="p-2 text-gray-400 hover:text-red-600" title="Remove round"><Trash2 size={14} /></button>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => sendPrep.mutate({ id: round.id })} disabled={sendPrep.isLoading || !round.interviewerEmail}
              title={round.interviewerEmail ? '' : 'Add an interviewer email first'}
              className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              Email prep + briefing
            </button>
            {round.prepSentAt && <span className="text-[11px] text-green-600">prep emailed</span>}
          </div>

          {/* Transcript -> feedback (hidden once feedback has been generated) */}
          {round.status !== 'completed' && (
            <div>
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={2}
                placeholder="Paste this round's transcript (optional — leave blank for a generated sample)…"
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs font-mono" />
              <button onClick={() => record.mutate({ id: round.id, transcript: transcript.trim() || undefined })} disabled={record.isLoading}
                className="mt-1.5 text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50 disabled:opacity-50">
                {record.isLoading ? 'Processing…' : 'Add transcript → feedback'}
              </button>
            </div>
          )}

          {/* ===== Briefing dropdown (above feedback) ===== */}
          <div>
            <button type="button" onClick={() => setShowBriefing((v) => !v)}
              className="flex items-center justify-between w-full text-left px-3 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg">
              <span className="text-xs font-bold text-gray-800">Briefing for {round.roundName}'s interviewer</span>
              {showBriefing ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
            </button>
            {showBriefing && (
              <div className="mt-1.5 space-y-1.5">
                {briefing.isLoading && <div className="text-[11px] text-gray-400">Loading…</div>}
                {briefing.data && briefing.data.rounds.length === 0 && briefing.data.followUps.length === 0 && questions.length === 0 && standardQuestions.length === 0 && (
                  <div className="text-[11px] text-gray-400">No interview questions or earlier-round notes on file yet.</div>
                )}

                {standardQuestions.length > 0 && (() => {
                  const key = 'stdq';
                  const isOpen = briefOpen[key] ?? true;
                  return (
                    <div className="border border-gray-200 rounded">
                      <button type="button" onClick={() => setBriefOpen((st) => ({ ...st, [key]: !(st[key] ?? true) }))}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5">
                        {isOpen ? <ChevronDown size={11} className="text-gray-400 shrink-0" /> : <ChevronRight size={11} className="text-gray-400 shrink-0" />}
                        <span className="text-[11px] font-semibold text-gray-700">Standard interview questions · ~70% ({standardQuestions.length})</span>
                      </button>
                      {isOpen && (
                        <ul className="text-[11px] text-gray-600 list-disc pl-6 pr-2 py-2 space-y-1">
                          {standardQuestions.map((qq: any, i: number) => (
                            <li key={i}>{qq.category ? <strong>{qq.category}: </strong> : null}{qq.question}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                {questions.length > 0 && (() => {
                  const key = 'tailoredq';
                  const isOpen = briefOpen[key] ?? true;
                  return (
                    <div className="border border-gray-200 rounded">
                      <button type="button" onClick={() => setBriefOpen((st) => ({ ...st, [key]: !(st[key] ?? true) }))}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5">
                        {isOpen ? <ChevronDown size={11} className="text-gray-400 shrink-0" /> : <ChevronRight size={11} className="text-gray-400 shrink-0" />}
                        <span className="text-[11px] font-semibold text-gray-700">Tailored questions for this candidate · ~30% ({questions.length})</span>
                      </button>
                      {isOpen && (
                        <ul className="text-[11px] text-gray-600 list-disc pl-6 pr-2 py-2 space-y-1">
                          {questions.map((qq: any, i: number) => (
                            <li key={i}>{qq.category ? <strong>{qq.category}: </strong> : null}{qq.question}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                {briefing.data && briefing.data.rounds.map((b: any, i: number) => {
                  const key = `read-${i}`;
                  const isOpen = briefOpen[key] ?? false;
                  return (
                    <div key={key} className="border border-gray-200 rounded">
                      <button type="button" onClick={() => setBriefOpen((st) => ({ ...st, [key]: !isOpen }))}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5">
                        {isOpen ? <ChevronDown size={11} className="text-gray-400 shrink-0" /> : <ChevronRight size={11} className="text-gray-400 shrink-0" />}
                        <span className="text-[11px] font-semibold text-gray-700">{b.roundName} — read on the candidate</span>
                        {b.interviewerName && <span className="text-[10px] text-gray-400">· from {b.interviewerName}</span>}
                      </button>
                      {isOpen && (
                        <p className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded mx-2 mb-2 p-2">{b.writtenRead}</p>
                      )}
                    </div>
                  );
                })}

                {briefing.data && briefing.data.followUps.length > 0 && (() => {
                  const key = 'questions';
                  const isOpen = briefOpen[key] ?? true;
                  return (
                    <div className="border border-blue-200 rounded">
                      <button type="button" onClick={() => setBriefOpen((st) => ({ ...st, [key]: !(st[key] ?? true) }))}
                        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 bg-blue-50">
                        {isOpen ? <ChevronDown size={11} className="text-blue-500 shrink-0" /> : <ChevronRight size={11} className="text-blue-500 shrink-0" />}
                        <span className="text-[11px] font-semibold text-blue-700">New questions to ask this round ({briefing.data.followUps.length})</span>
                      </button>
                      {isOpen && (
                        <ul className="text-[11px] text-blue-800 list-disc pl-6 pr-2 py-2 space-y-1">
                          {briefing.data.followUps.map((f: any, i: number) => (
                            <li key={i}><strong>{FOLLOW_LABEL[f.type] ?? 'Follow up'}:</strong> {f.text} <span className="text-blue-400">(from {f.roundName})</span></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                {briefing.data && (briefing.data.rounds.length > 0 || briefing.data.followUps.length > 0) && (
                  <div className="text-[10px] text-gray-400">Each earlier round's score is hidden, and coaching notes written for earlier interviewers aren't shared.</div>
                )}
              </div>
            )}
          </div>

          {/* ===== Outgoing briefing — the read + follow-ups sent to the NEXT interviewer. Always editable, on every round. ===== */}
          {(
            <div>
              <div className="flex items-center gap-1.5 w-full px-3 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg">
                <button type="button" onClick={() => setFbOpen((v) => !v)} className="flex items-center justify-between flex-1 text-left">
                  <span className="text-xs font-bold text-gray-800">Briefing to the next interviewer{round.score != null ? ` · score ${round.score}/100` : ''}</span>
                  {fbOpen ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                </button>
                {!fbEdit && (
                  <button type="button" onClick={startEditFb}
                    title="Edit the briefing that carries forward to the next interviewer"
                    className="p-1 text-gray-400 hover:text-ls-primary shrink-0"><Pencil size={13} /></button>
                )}
              </div>
              {fbOpen && !fbEdit && (
                <div className="mt-1.5 space-y-2">
                  {round.feedbackHr && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-700">Read on the candidate</div>
                      <p className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{round.feedbackHr}</p>
                    </div>
                  )}
                  {fus.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-gray-700">Follow up in later rounds <span className="font-normal text-gray-400">(sent to the next interviewer)</span></div>
                      <ul className="text-[11px] text-gray-600 list-disc pl-4">
                        {fus.map((f: any, i: number) => <li key={i}><strong>{FOLLOW_LABEL[f.type] ?? 'Follow up'}:</strong> {f.text}</li>)}
                      </ul>
                    </div>
                  )}
                  {!round.feedbackHr && fus.length === 0 && (
                    <div className="text-[11px] text-gray-400">No briefing yet. Click the pencil to write the read + follow-ups that carry forward to the next interviewer.</div>
                  )}
                </div>
              )}
              {fbOpen && fbEdit && (
                <div className="mt-1.5 space-y-2 border border-ls-cyan/40 rounded-lg p-2 bg-white">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-700 mb-1">Read on the candidate</div>
                    <textarea value={draftRead} onChange={(e) => setDraftRead(e.target.value)} rows={3}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px]" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-700 mb-1">Follow-ups sent to the next interviewer</div>
                    <div className="space-y-1.5">
                      {draftFus.map((f: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <select value={f.type} onChange={(e) => setDraftFus((arr) => arr.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                            className="px-1.5 py-1 border border-gray-300 rounded text-[11px] shrink-0">
                            {FOLLOW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <input value={f.text} onChange={(e) => setDraftFus((arr) => arr.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                            placeholder="What the next round should dig into…"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-[11px]" />
                          <button type="button" onClick={() => setDraftFus((arr) => arr.filter((_, j) => j !== i))}
                            className="p-1 text-gray-400 hover:text-red-600 shrink-0" title="Remove"><X size={13} /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setDraftFus((arr) => [...arr, { type: 'suggested', text: '' }])}
                        className="text-[11px] text-gray-500 hover:text-ls-primary flex items-center gap-1"><Plus size={11} /> Add a follow-up</button>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => saveFb.mutate({ id: round.id, feedbackHr: draftRead.trim() || null, followUps: draftFus.filter((f: any) => (f.text ?? '').trim()).map((f: any) => ({ type: f.type, text: f.text.trim() })) })}
                      disabled={saveFb.isLoading}
                      className="text-[11px] px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">
                      {saveFb.isLoading ? 'Saving…' : 'Save briefing'}</button>
                    <button onClick={() => setFbEdit(false)} className="text-[11px] px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scorecards filled out for this round */}
          <div className="border-t border-gray-100 pt-2">
            <div className="text-[11px] font-semibold text-gray-700 mb-1">Scorecards</div>
            {roundReviews.length === 0 && <div className="text-[11px] text-gray-400 mb-1">No scorecard filled out for this round yet.</div>}
            <div className="space-y-1.5">
              {roundReviews.map((rv: any) => {
                const avg = rv.scores.length ? (rv.scores.reduce((a: number, b: any) => a + b.score, 0) / rv.scores.length).toFixed(1) : '—';
                return (
                  <Link key={rv.id} to={`/hiring/scorecards?id=${round.candidateId}&round=${round.id}&review=${rv.id}`}
                    className="flex items-center justify-between gap-2 bg-gray-50 rounded p-2 border border-transparent hover:bg-gray-100 hover:border-ls-cyan transition-colors">
                    <span className="text-[11px] font-medium text-gray-800 truncate">
                      {rv.reviewerName}<span className="text-gray-500 font-normal"> · {avg} / 5 · {new Date(rv.reviewedAt).toLocaleDateString()}</span>
                    </span>
                    <span className="text-[11px] text-ls-primary font-medium shrink-0">View / edit scorecard →</span>
                  </Link>
                );
              })}
            </div>
            {roundReviews.length === 0 && (
              <Link to={`/hiring/scorecards?id=${round.candidateId}&round=${round.id}`}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-ls-primary hover:underline">
                <Plus size={11} /> Fill scorecard for this round
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Interviews() {
  const [params, setParams] = useSearchParams();
  const [candidateId, setCandidateId] = useState<string | null>(params.get('id'));
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newRound, setNewRound] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [autoSeeded, setAutoSeeded] = useState<Record<string, boolean>>({});
  const [showQuestions, setShowQuestions] = useState(false);

  const { data: candidates, refetch } = trpc.candidates.list.useQuery(undefined);
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();
  const rounds = trpc.interviews.list.useQuery({ candidateId: candidateId ?? '' }, { enabled: !!candidateId });
  const reviewsQuery = trpc.values.getCandidateReviews.useQuery({ candidateId: candidateId ?? '' }, { enabled: !!candidateId });
  const stdQ = trpc.interviews.standardQuestions.useQuery({ candidateId: candidateId ?? '' }, { enabled: !!candidateId });
  const { data: valuesList } = trpc.values.list.useQuery();
  const valueName: Record<string, string> = {};
  (valuesList ?? []).forEach((v: any) => { valueName[v.id] = v.name; });
  const refreshAll = () => { rounds.refetch(); reviewsQuery.refetch(); refetch(); };

  const seed = trpc.interviews.seedFromPlan.useMutation({ onSuccess: () => refreshAll() });
  const add = trpc.interviews.addRound.useMutation({ onSuccess: () => { setNewRound(''); refreshAll(); } });
  const reject = trpc.candidates.reject.useMutation({ onSuccess: () => { setRejectOpen(false); setRejectReason(''); refreshAll(); }, onError: (err) => alert(err.message) });
  const setException = trpc.interviews.setWindowException.useMutation({ onSuccess: () => refetch(), onError: (err) => alert(err.message) });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const active = (candidates ?? []).filter((c: any) => INTERVIEW_STAGES.includes(c.currentStage));
  const selected: any = (candidates ?? []).find((c: any) => c.id === candidateId) ?? null;
  useEffect(() => { if (!candidateId && active.length) setCandidateId(active[0].id); }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-create rounds from the role's plan when viewing a candidate at/after the
  // interview stage who has none yet (covers candidates who advanced before this
  // was automatic). Idempotent + attempted once per candidate per view.
  useEffect(() => {
    if (!selected || !candidateId) return;
    if (rounds.isLoading || !rounds.data) return;
    if (rounds.data.length > 0) return;
    if (!INTERVIEW_STAGES.includes(selected.currentStage)) return;
    if (autoSeeded[candidateId]) return;
    setAutoSeeded((m) => ({ ...m, [candidateId]: true }));
    seed.mutate({ candidateId });
  }, [candidateId, rounds.data, rounds.isLoading, selected?.currentStage]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleTitle = selected ? ((jobDescriptions ?? []).find((j: any) => j.id === selected.jdId)?.jobTitle ?? '—') : '';
  const list = (rounds.data ?? []) as any[];
  const done = list.filter((r) => r.status === 'completed').length;
  const scored = list.filter((r) => typeof r.score === 'number');
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : null;
  const nextUp = list.find((r) => r.status !== 'completed');
  const firstIncompleteId = nextUp?.id;

  // 48-hour window check across this candidate's scheduled rounds.
  const scheduledTimes = list
    .filter((r) => r.scheduledAt)
    .map((r) => new Date(r.scheduledAt).getTime())
    .sort((a, b) => a - b);
  const windowHrs = scheduledTimes.length >= 2
    ? Math.round(businessHoursBetween(scheduledTimes[0], scheduledTimes[scheduledTimes.length - 1]))
    : null;
  const withinWindow = windowHrs == null ? null : windowHrs <= INTERVIEW_WINDOW_HOURS;
  const allScheduled = list.length > 0 && scheduledTimes.length === list.length;
  const windowExempt = !!(selected as any)?.interviewWindowException;
  const isTerminal = selected ? ['Rejected', 'Hired', 'Not Selected'].includes(selected.currentStage) : false;

  const filtered = active.filter((c: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${c.firstName} ${c.lastName} ${c.email ?? ''} ${c.currentStage}`.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Interviews</h1>
        <div className="relative w-[300px]">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={pickerOpen ? search : (selected ? `${selected.firstName} ${selected.lastName}` : '')}
            onChange={(e) => { setSearch(e.target.value); setPickerOpen(true); }}
            onFocus={() => { setSearch(''); setPickerOpen(true); }}
            onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
            placeholder="Search candidates by name, email, stage…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm"
          />
          {pickerOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
              {filtered.map((c: any) => (
                <button key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); setCandidateId(c.id); setParams({ id: c.id }); setPickerOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 ${c.id === candidateId ? 'bg-gray-50' : ''}`}>
                  <span className="truncate">{c.firstName} {c.lastName}{c.email ? <span className="text-gray-400"> · {c.email}</span> : null}</span>
                  <span className="text-[11px] text-gray-500 shrink-0">{c.currentStage}</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
            </div>
          )}
        </div>
      </div>

      {!selected && (
        <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          Pick a candidate to see their interview workspace.
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          {/* Candidate header + stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full ls-accent-grad text-white flex items-center justify-center text-sm font-bold">
                {selected.firstName?.[0]}{selected.lastName?.[0]}
              </div>
              <div>
                <div className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</div>
                <div className="text-xs text-gray-500">{roleTitle} · {selected.currentStage}</div>
              </div>
              {!isTerminal && (
                <button onClick={() => setRejectOpen(true)}
                  title="Reject this candidate (e.g. after a weak round, before the next one)"
                  className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-md font-medium hover:bg-red-50">
                  <XCircle size={13} /> Reject
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Rounds done" value={`${done} of ${list.length}`} />
              <Stat label="Avg score" value={avg != null ? `${avg}` : '—'} />
              <Stat label="Next up" value={nextUp ? nextUp.roundName : (list.length ? 'Done' : '—')} />
            </div>

            {list.length > 0 && (
              <div className="mt-2 space-y-1 text-[11px]">
                {windowExempt ? (
                  <div className="rounded bg-blue-50 border border-blue-200 text-blue-800 px-2 py-1 flex items-center justify-between gap-2">
                    <span>⏸ Scheduling exception on — the 48-business-hour window isn't enforced for this candidate{(selected as any)?.interviewWindowExceptionNote ? ` (${(selected as any).interviewWindowExceptionNote})` : ''}.</span>
                    <button onClick={() => setException.mutate({ candidateId: selected.id, enabled: false })}
                      className="underline shrink-0 hover:text-blue-900">Turn off</button>
                  </div>
                ) : (
                  <>
                    {windowHrs != null && !withinWindow && (
                      <div className="rounded bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 flex items-center justify-between gap-2">
                        <span>⚠ Rounds span {fmtSpan(windowHrs)} of business time — rounds must be within 48 business hours (weekends excluded); a time outside that window is blocked.</span>
                        <button onClick={() => { const note = window.prompt('Reason for the scheduling exception (e.g. interviewer on vacation):', '') ?? ''; setException.mutate({ candidateId: selected.id, enabled: true, note: note.trim() || null }); }}
                          className="underline shrink-0 hover:text-amber-900">Allow exception</button>
                      </div>
                    )}
                    {windowHrs != null && withinWindow && (
                      <div className="rounded bg-green-50 border border-green-200 text-green-700 px-2 py-1">
                        ✓ Scheduled rounds fall within {fmtSpan(windowHrs)} of business time (rule: ≤ 48 business hours, weekends excluded).
                      </div>
                    )}
                    {!allScheduled && (
                      <div className="text-gray-500 flex items-center justify-between gap-2">
                        <span>{scheduledTimes.length} of {list.length} rounds have a time set{scheduledTimes.length === list.length ? '' : ' — set times to check the 48-business-hour window'}.</span>
                        <button onClick={() => { const note = window.prompt('Reason for the scheduling exception (e.g. interviewer on vacation):', '') ?? ''; setException.mutate({ candidateId: selected.id, enabled: true, note: note.trim() || null }); }}
                          className="underline shrink-0 text-gray-400 hover:text-gray-600">Allow exception</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Rounds */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Rounds</div>
            <div className="space-y-2">
              {list.map((r) => (
                <RoundCard key={r.id} round={r} defaultOpen={r.id === firstIncompleteId} onChanged={refreshAll} reviews={reviewsQuery.data ?? []} valueName={valueName} questions={(selected as any).interviewQuestions ?? []} standardQuestions={stdQ.data?.questions ?? []} />
              ))}
              {list.length === 0 && <div className="text-xs text-gray-400 pb-1">No rounds yet. They appear automatically from the role plan when a candidate reaches the interview stage, or add one below.</div>}
            </div>

            {/* Rounds appear automatically from the role's plan at the interview stage.
                Add round stays available, tucked away, for one-off extras. */}
            {addOpen ? (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input autoFocus value={newRound} onChange={(e) => setNewRound(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newRound.trim()) { add.mutate({ candidateId: selected.id, roundName: newRound.trim() }); setAddOpen(false); } }}
                  placeholder="Round name (e.g. Final with VP)"
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs flex-1 min-w-[180px]" />
                <button onClick={() => { if (newRound.trim()) { add.mutate({ candidateId: selected.id, roundName: newRound.trim() }); setAddOpen(false); } }} disabled={add.isLoading || !newRound.trim()}
                  className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">Add</button>
                <button onClick={() => { setAddOpen(false); setNewRound(''); }} className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddOpen(true)} className="mt-2 text-xs text-gray-500 hover:text-ls-primary flex items-center gap-1">
                <Plus size={13} /> Add a round
              </button>
            )}
          </div>

          {/* Candidate self-scheduling (Calendly) — collapsed */}
          <SchedulingSection key={`sched-${selected.id}`} candidate={selected} onChanged={refetch} />

          {/* Auto-generated questions — single quiet line */}
          <div className="border border-gray-200 rounded-xl px-4 py-3">
            <button onClick={() => setShowQuestions((v) => !v)} className="flex items-center justify-between w-full text-left">
              <span className="text-xs text-gray-600">Interview questions are auto-generated for every round</span>
              <span className="text-xs text-ls-primary">{showQuestions ? 'Hide' : 'View set'}</span>
            </button>
            {showQuestions && (
              <div className="mt-2 space-y-2">
                {selected.interviewQuestions
                  ? (selected.interviewQuestions as any[]).map((q: any, i: number) => (
                      <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                        <div className="font-medium text-gray-700">{q.category}</div>
                        <div className="text-gray-600 mt-0.5">{q.question}</div>
                      </div>
                    ))
                  : <div className="text-xs text-gray-400">Questions are generated automatically once the candidate reaches the interview stage.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject modal — reject a candidate mid-process (e.g. between rounds) */}
      {rejectOpen && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-200 p-5 w-96">
            <div className="text-sm font-semibold text-gray-700 mb-3">Reject {selected.firstName} {selected.lastName}</div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} placeholder="e.g. Did not pass the first-round interview…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan mb-3" />
            <div className="flex gap-2">
              <button onClick={() => reject.mutate({ id: selected.id, reason: rejectReason })}
                disabled={!rejectReason || reject.isLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {reject.isLoading ? 'Rejecting…' : 'Reject'}
              </button>
              <button onClick={() => { setRejectOpen(false); setRejectReason(''); }} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
