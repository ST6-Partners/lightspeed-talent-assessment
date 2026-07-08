// ============================================================
// INTERVIEWS TAB — one workspace for everything interview-related,
// per candidate. Pick a candidate, see the round rollup (resembles the
// design mockup), manage each round + the cross-round briefing, and the
// interviewer details, scheduling, questions, transcript and feedback
// that used to live inside the candidate panel.
// ============================================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import {
  Section,
  EditableField,
  SchedulingSection,
  InterviewRoundsSection,
  InterviewFeedbackSection,
} from './Candidates';

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 flex-1 min-w-[120px]">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Interviews() {
  const [params, setParams] = useSearchParams();
  const initialId = params.get('id');
  const [candidateId, setCandidateId] = useState<string | null>(initialId);

  const { data: candidates, refetch } = trpc.candidates.list.useQuery(undefined);
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();
  const rounds = trpc.interviews.list.useQuery(
    { candidateId: candidateId ?? '' },
    { enabled: !!candidateId },
  );
  const updateMutation = trpc.candidates.update.useMutation({ onSuccess: () => refetch() });
  const saveField = (id: string, field: string, value: string) =>
    updateMutation.mutate({ id, [field]: value } as any);

  const active = (candidates ?? []).filter((c: any) => c.currentStage !== 'Rejected');
  const selected: any = (candidates ?? []).find((c: any) => c.id === candidateId) ?? null;

  useEffect(() => {
    if (!candidateId && active.length) setCandidateId(active[0].id);
  }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleTitle = selected
    ? (jobDescriptions ?? []).find((j: any) => j.id === selected.jdId)?.jobTitle ?? '—'
    : '';

  const list = (rounds.data ?? []) as any[];
  const total = list.length;
  const done = list.filter((r) => r.status === 'completed').length;
  const scored = list.filter((r) => typeof r.score === 'number');
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : null;
  const upcoming = list
    .filter((r) => r.status !== 'completed' && r.scheduledAt)
    .map((r) => new Date(r.scheduledAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const finishBy = upcoming
    ? upcoming.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '—';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Interviews</h1>
          <p className="text-xs text-gray-500">Rounds, briefings, scheduling, questions, transcript and feedback — all in one place.</p>
        </div>
        <select
          value={candidateId ?? ''}
          onChange={(e) => { setCandidateId(e.target.value || null); setParams(e.target.value ? { id: e.target.value } : {}); }}
          className="px-3 py-2 border border-gray-300 rounded text-sm min-w-[220px]"
        >
          <option value="">Select a candidate…</option>
          {active.map((c: any) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.currentStage}</option>
          ))}
        </select>
      </div>

      {!selected && (
        <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          Pick a candidate to see their interview workspace.
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          {/* Header + rollup (mockup) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full ls-accent-grad text-white flex items-center justify-center text-sm font-bold">
                  {selected.firstName?.[0]}{selected.lastName?.[0]}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</div>
                  <div className="text-xs text-gray-500">{roleTitle} · stage: {selected.currentStage}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatCard label="Rounds done" value={`${done} of ${total}`} />
              <StatCard label="Combined score" value={avg != null ? `${avg}` : '—'} sub={avg != null ? 'avg across rounds' : 'no scores yet'} />
              <StatCard label="Finish all by" value={finishBy} tone={upcoming ? 'warn' : undefined} />
            </div>
          </div>

          {/* Per-round interviews + cross-round briefing */}
          <InterviewRoundsSection key={`ivr-${selected.id}`} candidateId={selected.id} onChanged={() => { rounds.refetch(); refetch(); }} />

          {/* Interviewer details (primary/default interviewer for the single-interview flow) */}
          <Section title="Interviewer (default)">
            <EditableField label="Name" value={selected.interviewerName ?? ''} onSave={(v) => saveField(selected.id, 'interviewerName', v)} />
            <EditableField label="Email" value={selected.interviewerEmail ?? ''} onSave={(v) => saveField(selected.id, 'interviewerEmail', v)} />
            <EditableField label="Zoom Meeting ID" value={selected.zoomMeetingId ?? ''} onSave={(v) => saveField(selected.id, 'zoomMeetingId', v)} />
          </Section>

          {/* Scheduling — availability request + candidate self-booking */}
          <SchedulingSection key={`sched-${selected.id}`} candidate={selected} onChanged={refetch} />

          {/* Interview questions (read-only, AI-generated) */}
          {selected.interviewQuestions && (
            <Section title="Interview Questions (AI-generated)">
              <div className="space-y-2">
                {(selected.interviewQuestions as any[]).map((q: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                    <div className="font-medium text-gray-700">{q.category}</div>
                    <div className="text-gray-600 mt-0.5">{q.question}</div>
                    {q.rationale && <div className="text-gray-400 mt-0.5 italic">{q.rationale}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Transcript -> feedback (candidate, HR, interviewer) + email */}
          <InterviewFeedbackSection key={`ivf-${selected.id}`} candidate={selected} onChanged={refetch} />
        </div>
      )}
    </div>
  );
}
