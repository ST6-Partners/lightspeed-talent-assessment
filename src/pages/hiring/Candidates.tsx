import { useState, useEffect, Fragment } from 'react';
import ResumeRequirements from '../../components/ResumeRequirements';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, ChevronRight, ChevronLeft, Ban, ChevronDown, Trash2, Info, Archive, RotateCcw, Check, Search } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { CANDIDATE_STAGES, PIPELINE_STAGES, CLOSED_STAGES as CLOSED } from '../../../server/src/domain/stages.js';
import RoleRankingDropdown from './RoleRankingDropdown';

const STAGES = CANDIDATE_STAGES;

const STAGE_COLORS: Record<string, string> = {
  Applied: 'bg-purple-100 text-purple-700',
  Assessment: 'bg-blue-100 text-blue-700',
  'Work Sample': 'bg-indigo-100 text-indigo-700',
  'Candidate Review': 'bg-cyan-100 text-cyan-700',
  'Phone Screen': 'bg-teal-100 text-teal-700',
  'Interview': 'bg-yellow-100 text-yellow-700',
  'Reference Check': 'bg-rose-100 text-rose-700',
  Offer: 'bg-emerald-100 text-emerald-700',
  Hired: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  'Not Selected': 'bg-gray-100 text-gray-600',
};

type Stage = typeof STAGES[number];

// Display-name overrides for the pipeline accordion. The underlying stage enum
// (and every candidate's currentStage) is unchanged — this only relabels a few
// stages to match the agreed pipeline wording. Stages not listed render as-is.
const STAGE_LABEL: Record<string, string> = {
  'Interview': 'Scheduled Interview',
};
const stageLabel = (s: string): string => STAGE_LABEL[s] ?? s;

// ── "Needs action" — one source of truth for the badge, the filter, and the
// in-dropdown banner ──────────────────────────────────────────────────────
// "Needs action" = the system is waiting on a human advance/reject decision and
// the thing that stage waits on has already happened:
//   • Reference Check  — always (only a human moves it to Offer or reject)
//   • Offer            — always (a human sends the offer letter, then marks Hired)
//   • Work Sample      — once the sample is submitted or scored (take-home or walkthrough)
//   • Phone Screen     — until the candidate confirms a time, or once the call has ended
//   • Interview        — when there is no common availability to book the round
export function needsAction(c: any): boolean {
  switch (c.currentStage) {
    case 'Reference Check': return true;
    case 'Offer': {
      // Recruiter action is needed only when nothing has been sent yet, or the
      // hiring manager sent the offer back. Once the offer letter is delivered
      // (offerSignToken set) it is on the candidate to sign; while it is pending
      // manager approval it is on the manager. Neither is a recruiter task.
      if (c.offerSignToken) return false;
      if (c.offerApprovalState === 'pending') return false;
      return true;
    }
    case 'Interview': return !!c.interviewNeedsOutreach;
    case 'Work Sample': {
      // Take-home: action once there's a submission or score to review.
      if (c.workSampleSubmittedAt || c.workSampleScore != null) return true;
      // Live walkthrough: action while the recruiter still needs to offer times
      // (nothing scheduled yet, no windows sent). Once sent, it's on the candidate.
      if (c.workSampleIsWalkthrough && !c.workSampleScheduledAt && !c.workSampleBookingOpenedAt) return true;
      return false;
    }
    case 'Phone Screen': {
      // Needs action until the CANDIDATE confirms a time (phoneScreenScheduledAt).
      // Covers: recruiter still owes availability, windows sent but not yet booked,
      // and the candidate replied "no availability" (no time set). Also flags again
      // once the scheduled call has actually ENDED (phoneScreenEndAt — falls back to
      // the start time for older records confirmed before that field existed) and a
      // decision is due — not merely once it's started.
      const confirmed = !!c.phoneScreenScheduledAt;
      const callEndRef = c.phoneScreenEndAt ?? c.phoneScreenScheduledAt;
      const callHappened = confirmed && new Date(callEndRef).getTime() < Date.now();
      return !confirmed || callHappened;
    }
    default: return false;
  }
}

// The specific, plain-language action the recruiter needs to take. Returns a
// short headline + a one/two-sentence detail, so both the badge tooltip and the
// prominent in-dropdown banner say exactly the same thing for every case.
export type NeedsActionInfo = { headline: string; detail: string };
export function needsActionInfo(c: any): NeedsActionInfo {
  if (c.currentStage === 'Interview' && c.interviewNeedsOutreach) {
    return {
      headline: 'Reach out to set the interview time',
      detail: 'No common interview availability. Contact the candidate directly to agree on a time, then set the round time below.',
    };
  }
  if (c.currentStage === 'Phone Screen') {
    if (!c.phoneScreenScheduledAt) {
      if (Array.isArray(c.phoneScreenCandidateSlots) && c.phoneScreenCandidateSlots.length > 0) {
        return {
          headline: 'Reach out to set a time',
          detail: 'The candidate couldn’t make your proposed times, so there’s no common availability. Contact them directly to agree on a time, then log it in the Screening call section below.',
        };
      }
      return c.phoneScreenBookingOpenedAt
        ? {
            headline: 'Follow up on the phone screen',
            detail: 'The candidate hasn’t booked a time yet (or replied that none work). Follow up so the call gets on the calendar.',
          }
        : {
            headline: 'Set your phone-screen availability',
            detail: 'Add your availability in the Screening call section below so the candidate can pick a time to confirm.',
          };
    }
    return {
      headline: 'Log the phone-screen outcome',
      detail: 'The screening call has ended. Record how it went, then decide: advance the candidate or reject.',
    };
  }
  if (c.currentStage === 'Work Sample') {
    if (c.workSampleIsWalkthrough && !(c.workSampleSubmittedAt || c.workSampleScore != null)) {
      return {
        headline: 'Offer walkthrough times',
        detail: 'This role’s work sample is a live walkthrough. Offer at least 3 time windows in the Work Sample section below so the candidate can pick one.',
      };
    }
    return {
      headline: 'Review the work sample',
      detail: 'The candidate’s work sample is in and AI-graded (advisory only). Review it in the Work Sample section below, then advance or reject.',
    };
  }
  if (c.currentStage === 'Reference Check') {
    return {
      headline: 'Record the reference-check outcome',
      detail: 'References are handled off-system. Record the outcome in the Reference Check section below — Cleared advances to Offer, Failed rejects.',
    };
  }
  if (c.currentStage === 'Offer') {
    if (c.offerApprovalState === 'sent_back') {
      return {
        headline: 'Revise and resend the offer',
        detail: 'The hiring manager sent the offer back for changes. Update it in the Offer section below, then send it again (directly to the candidate, or for approval).',
      };
    }
    return {
      headline: 'Send the offer',
      detail: 'Draft and send the offer letter from the Offer section below, either directly to the candidate or to the hiring manager for approval first.',
    };
  }
  return {
    headline: 'Action needed',
    detail: 'This candidate is waiting on your decision — advance or reject.',
  };
}
export function needsActionReason(c: any): string { return needsActionInfo(c).detail; }

export default function Candidates() {
  const [showForm, setShowForm] = useState(false);
  const [stageFilter, setStageFilter] = useState<Stage | ''>('');
  const [internalFilter, setInternalFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWsScoring, setShowWsScoring] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link support: /hiring/candidates?candidate=<id> preselects that candidate.
  useEffect(() => {
    const c = searchParams.get('candidate');
    if (c) { setSelectedId(c); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [openClosed, setOpenClosed] = useState<Record<string, boolean>>({});
  const [showClosedRoles, setShowClosedRoles] = useState(false);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', resumeText: '', source: '', notes: '',
    needsSponsorship: false,
    isInternal: false,
    internalEmployee: '',
    references: [] as { name: string; email: string; relationship: string }[],
  });
  const [deptFilter, setDeptFilter] = useState('');
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({});
  const [roleSearch, setRoleSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveTarget, setBulkMoveTarget] = useState<Stage | ''>('');
  const BULK_REJECT = '__bulk__';

  const { data: candidates, refetch } = trpc.candidates.list.useQuery(
    stageFilter ? { stage: stageFilter } : undefined
  );
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();
  const { data: requisitions } = trpc.requisitions.list.useQuery();
  const { data: departmentsList } = trpc.departments.list.useQuery();
  const deptByReq: Record<string, string> = {};
  for (const r of (requisitions ?? []) as any[]) deptByReq[r.id] = r.department;
  // A JD's department can come from the JD itself, its legacy jd.req_id link, or
  // the reusable-JD link (a requisition points to the JD via base_jd_id). Mirrors
  // Intake's jdDeptOf so a reusable/library JD (null req_id) — e.g. General
  // Manager, International — resolves to its real department instead of being
  // dropped from every department filter in the Add Candidate picker.
  const deptByBaseJd: Record<string, string> = {};
  for (const r of (requisitions ?? []) as any[]) if (r.baseJdId) deptByBaseJd[r.baseJdId] = r.department;
  const jdDeptOf = (j: any) => j.department ?? deptByReq[j.reqId] ?? deptByBaseJd[j.id];
  const jdDepartments = Array.from(new Set(((jobDescriptions ?? []) as any[]).map((j) => jdDeptOf(j)).filter(Boolean))).sort();
  const deptOptions = Array.from(new Set([
    ...(((departmentsList ?? []) as any[]).map((d) => d.name)),
    ...jdDepartments,
  ])).sort();
  const jdOptions = deptFilter
    ? ((jobDescriptions ?? []) as any[]).filter((j) => jdDeptOf(j) === deptFilter)
    : ((jobDescriptions ?? []) as any[]);

  const [resumeFileName, setResumeFileName] = useState('');
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const handleResumeUpload = async (file: File) => {
    setResumeUploadError(null);
    setUploadingResume(true);
    try {
      const buffer = await file.arrayBuffer();
      const resp = await fetch('/api/upload/resume', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) },
        body: buffer,
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) { setResumeUploadError(result.error || 'Upload failed'); return; }
      setForm((f: any) => ({ ...f, resumeUrl: result.url, resumeText: result.text || '' }));
      setResumeFileName(file.name);
      if (!result.text) setResumeUploadError('Saved the file, but couldn\u2019t read text from it — the resume screen may not run. A PDF, Word (.docx) or text file works best.');
    } catch (err: any) {
      setResumeUploadError(err?.message || 'Upload failed');
    } finally {
      setUploadingResume(false);
    }
  };
  // Undo window after a manual reject: the rejection email is delayed 2 minutes
  // server-side, so we surface a countdown + Undo so the recruiter can stop it.
  const REJECT_UNDO_WINDOW_MS = 2 * 60 * 1000;
  const [rejectNotice, setRejectNotice] = useState<{ ids: string[]; expiresAt: number } | null>(null);
  const [, setNoticeTick] = useState(0);
  useEffect(() => {
    if (!rejectNotice) return;
    const t = setInterval(() => {
      if (Date.now() >= rejectNotice.expiresAt) setRejectNotice(null);
      else setNoticeTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [rejectNotice]);
  const rejectCountdown = (expiresAt: number) => {
    const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };
  const createMutation = trpc.candidates.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); resetForm(); },
  });
  const advanceMutation = trpc.candidates.advanceStage.useMutation({
    onSuccess: () => refetch(),
  });
  const rejectMutation = trpc.candidates.reject.useMutation({
    onSuccess: (_data: any, vars: any) => { refetch(); setRejectingId(null); setRejectReason(''); setRejectNotice({ ids: [vars.id], expiresAt: Date.now() + REJECT_UNDO_WINDOW_MS }); },
  });
  const unrejectMutation = trpc.candidates.unreject.useMutation({
    onSuccess: () => refetch(),
  });
  const bulkRejectMutation = trpc.candidates.bulkReject.useMutation({
    onSuccess: (_data: any, vars: any) => { refetch(); setSelectedIds(new Set()); setRejectingId(null); setRejectReason(''); setRejectNotice({ ids: vars.ids, expiresAt: Date.now() + REJECT_UNDO_WINDOW_MS }); },
  });
  const undoReject = () => {
    if (!rejectNotice) return;
    rejectNotice.ids.forEach((id) => unrejectMutation.mutate({ id }));
    setRejectNotice(null);
  };
  const bulkAdvanceMutation = trpc.candidates.bulkAdvanceStage.useMutation({
    onSuccess: () => { refetch(); setSelectedIds(new Set()); setBulkMoveTarget(''); },
  });
  const updateMutation = trpc.candidates.update.useMutation({
    onSuccess: () => refetch(),
  });
  const sendWorkSampleMutation = trpc.workSample.send.useMutation({
    onSuccess: (res: any) => {
      refetch();
      if (res?.mode === 'live_walkthrough') {
        alert('This work sample is set to a live walkthrough. A "Work Sample Walkthrough" interview round has been created — schedule it and assign an interviewer in the Interviews tab.');
      }
    },
  });
  const workSampleReviewMutation = trpc.workSample.setReview.useMutation({
    onSuccess: () => refetch(),
  });
  const rescoreWorkSampleMutation = trpc.workSample.rescore.useMutation({
    onSuccess: () => refetch(),
  });
  const deleteMutation = trpc.candidates.delete.useMutation({
    onSuccess: () => { refetch(); setSelectedId(null); },
  });
  const doDelete = (id: string) => {
    // Hard delete removes the candidate entirely with no rejection record. Always
    // confirm, and steer toward Reject (reason + tracked + lands in Closed) as the
    // normal way to take a candidate out of the pipeline.
    if (window.confirm('Permanently delete this candidate? This cannot be undone and leaves no rejection record. To reject with a reason instead, cancel and use Reject.')) {
      deleteMutation.mutate({ id });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const doBulkMove = () => {
    if (selectedIds.size === 0 || !bulkMoveTarget) return;
    bulkAdvanceMutation.mutate({ ids: Array.from(selectedIds), toStage: bulkMoveTarget as Stage });
  };

  const resetForm = () => setForm({
    jdId: '', firstName: '', lastName: '', email: '',
    phone: '', linkedinUrl: '', resumeUrl: '', resumeText: '', source: '', notes: '',
    needsSponsorship: false,
    isInternal: false,
    internalEmployee: '',
    references: [] as { name: string; email: string; relationship: string }[],
  });

  // Work Sample is optional per role — skip it in the advance flow unless the
  // candidate's job description opts in (workSampleRequired).
  const requiresWorkSample = (c: any) => {
    if (!c?.jdId) return false;
    const jd = ((jobDescriptions ?? []) as any[]).find((j: any) => j.id === c.jdId);
    // The role includes the Work Sample step if it's explicitly required OR it
    // has a work sample task assigned (take-home or walkthrough). Roles with
    // neither skip the step.
    return jd?.workSampleRequired === true || !!jd?.workSampleTaskId;
  };
  const getPrevStage = (c: any): Stage | null => {
    const idx = STAGES.indexOf(c.currentStage as Stage);
    if (idx <= 0 || c.currentStage === 'Rejected' || c.currentStage === 'Not Selected') return null;
    let prev = STAGES[idx - 1];
    if (prev === 'Work Sample' && !requiresWorkSample(c)) prev = STAGES[idx - 2];
    return (prev as Stage) ?? null;
  };
  const getNextStage = (c: any): Stage | null => {
    const idx = STAGES.indexOf(c.currentStage as Stage);
    let next = STAGES[idx + 1];
    if (next === 'Work Sample' && !requiresWorkSample(c)) next = STAGES[idx + 2];
    if (!next || next === 'Rejected' || next === 'Not Selected') return null;
    return next;
  };

  const getJdTitle = (jdId: string | null) => {
    if (!jdId) return '—';
    return (jobDescriptions ?? []).find((j) => j.id === jdId)?.jobTitle ?? '—';
  };

  const selected = candidates?.find((c) => c.id === selectedId) ?? null;

  const saveNotes = (id: string, field: string, value: string) => {
    updateMutation.mutate({ id, [field]: value });
  };

  // "Applied" is hidden from the funnel: candidates pass through it into Assessment
  // instantly (placeholder mode), so the column is always empty. Still a real stage
  // in the data model — just not shown here.
  const FUNNEL_STAGES: readonly string[] = PIPELINE_STAGES.filter((s) => s !== 'Applied');
  // Roles start collapsed by default; the toggle reads the same `?? true` default so the first click expands.
  const toggleRole = (jdId: string) => setCollapsedRoles((m) => ({ ...m, [jdId]: !(m[jdId] ?? true) }));

  const CLOSED_STAGES: readonly string[] = CLOSED;
  const matchesInternal = (c: any) =>
    internalFilter === 'all' || (internalFilter === 'internal' ? c.isInternal : !c.isInternal);

  // Active applicants (drives the top stat cards).
  const visibleCandidates = ((candidates ?? []) as any[]).filter((c: any) =>
    matchesInternal(c) && !CLOSED_STAGES.includes(c.currentStage)
  );
  const jdById: Record<string, any> = {};
  for (const j of (jobDescriptions ?? []) as any[]) jdById[j.id] = j;
  const reqById: Record<string, any> = {};
  for (const r of (requisitions ?? []) as any[]) reqById[r.id] = r;
  // Resolve a JD's requisition: prefer the direct jd.req_id back-link, then fall
  // back to the reusable-JD link (requisition.base_jd_id) when the JD carries no
  // back-link. Mirrors the server's resolveReqIdForJd so a closed reusable-JD
  // role is recognized here too.
  const reqByBaseJd: Record<string, any> = {};
  for (const r of (requisitions ?? []) as any[]) if (r.baseJdId) reqByBaseJd[r.baseJdId] = r;
  const reqForJd = (jdId: string) => {
    const jd = jdById[jdId];
    if (jd?.reqId && reqById[jd.reqId]) return reqById[jd.reqId];
    return reqByBaseJd[jdId] ?? null;
  };

  // Group EVERY candidate (active + closed) by role, so a filled/closed role
  // still shows a card with its own closed-out list.
  const groupMap = new Map<string, any[]>();
  for (const c of ((candidates ?? []) as any[]).filter((c: any) => matchesInternal(c) && (!needsActionOnly || needsAction(c)))) {
    const key = c.jdId ?? 'none';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(c);
  }
  const roleGroups = Array.from(groupMap.entries()).map(([jdId, all]) => {
    const cands = all
      .filter((c: any) => !CLOSED_STAGES.includes(c.currentStage))
      .sort((a: any, b: any) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return sortOrder === 'oldest' ? ta - tb : tb - ta;
      });
    const closed = all
      .filter((c: any) => CLOSED_STAGES.includes(c.currentStage))
      .sort((a: any, b: any) => String(a.currentStage).localeCompare(String(b.currentStage)));
    const counts: Record<string, number> = {};
    for (const c of cands) counts[c.currentStage] = (counts[c.currentStage] ?? 0) + 1;
    const req = jdId === 'none' ? null : reqForJd(jdId);
    return {
      jdId,
      cands,
      closed,
      counts,
      reqStatus: (req?.status ?? null) as string | null,
      title: jdId === 'none' ? 'Unassigned role' : getJdTitle(jdId),
      dept: jdId === 'none' ? '' : (req?.department ?? deptByReq[jdById[jdId]?.reqId] ?? ''),
      hm: jdId === 'none' ? '' : (req?.hiringManager ?? reqById[jdById[jdId]?.reqId]?.hiringManager ?? ''),
    };
  }).sort((a, b) => b.cands.length - a.cands.length);

  // Show open roles that have NO candidate group yet as empty cards, so the list
  // matches the "Open roles" count and every Open requisition is visible — the
  // same rule the Open Roles (Postings) tab uses. Resolve the role's JD from
  // jd.reqId or the base-JD link when there is one (skipping a JD already covered
  // by a candidate group, and de-duping reusable JDs shared by two open reqs).
  // When an Open requisition has NO linked JD (e.g. a freshly opened role whose
  // JD link isn't set), still render it with a "{department} role" fallback title
  // instead of silently dropping it — otherwise the role appears on the Open
  // Roles tab but goes missing here.
  const presentJdIds = new Set(roleGroups.map((g) => g.jdId));
  const seenEmptyKeys = new Set<string>();
  const emptyOpenGroups = ((requisitions ?? []) as any[])
    .filter((r: any) => r.status === 'Open')
    .map((r: any) => {
      const jd = ((jobDescriptions ?? []) as any[]).find((j: any) => j.reqId === r.id)
        ?? (r.baseJdId ? jdById[r.baseJdId] : null);
      if (jd) {
        if (presentJdIds.has(jd.id) || seenEmptyKeys.has(jd.id)) return null;
        seenEmptyKeys.add(jd.id);
        return { jdId: jd.id, title: jd.jobTitle ?? getJdTitle(jd.id), r };
      }
      // No linked JD — key by the requisition so it still shows (one card per req).
      const key = `req:${r.id}`;
      if (seenEmptyKeys.has(key)) return null;
      seenEmptyKeys.add(key);
      return { jdId: key, title: `${r.department ?? 'Unassigned'} role`, r };
    })
    .filter(Boolean)
    .map(({ jdId, title, r }: any) => ({
      jdId,
      cands: [] as any[],
      closed: [] as any[],
      counts: {} as Record<string, number>,
      reqStatus: r.status as string | null,
      title,
      dept: (r.department ?? '') as string,
      hm: (r.hiringManager ?? '') as string,
    }))
    .sort((a: any, b: any) => a.title.localeCompare(b.title));
  const allRoleGroups = [...roleGroups, ...emptyOpenGroups];

  // Role search: filter the role list by title or department (case-insensitive).
  const roleQuery = roleSearch.trim().toLowerCase();
  const visibleRoleGroups = roleQuery
    ? allRoleGroups.filter((g) => g.title.toLowerCase().includes(roleQuery) || (g.dept ?? '').toLowerCase().includes(roleQuery))
    : allRoleGroups;

  // A role is "open" only when it is backed by a genuinely active requisition —
  // status 'Open' or 'On Hold'. Everything else collapses into the "Closed
  // roles" drawer instead of masquerading as an open role and inflating the
  // count: not just Closed/filled reqs, but also a role whose requisition can't
  // be resolved to an active one — e.g. a reusable/library JD that still has
  // candidates attached but no open requisition (reqStatus null or 'Draft').
  // (Testing only reqStatus !== 'Closed' let those null/Draft roles show as open,
  // which is exactly how the two extra role cards were leaking into the list.)
  // The unassigned ('none') bucket always stays in the open list so its
  // candidates remain actionable.
  const ACTIVE_REQ_STATUSES: readonly string[] = ['Open', 'On Hold'];
  const isActiveRole = (g: any) => g.jdId === 'none' || ACTIVE_REQ_STATUSES.includes(g.reqStatus as string);
  const openRoleGroups = visibleRoleGroups.filter(isActiveRole);
  const closedRoleGroups = visibleRoleGroups.filter((g) => !isActiveRole(g));
  // "Open roles" stat = the number of active role cards actually shown in the
  // open list, so the number always matches what's on screen. The 'none'
  // unassigned bucket isn't a role, so it's excluded from the count.
  const openRoleCount = openRoleGroups.filter((g) => g.jdId !== 'none').length;

  const candidateRow = (c: any) => {
    const nextStage = getNextStage(c);
    const isSel = selectedId === c.id;
    return (
      <Fragment key={c.id}>
      <tr onClick={() => setSelectedId(isSel ? null : c.id)}
        className={`border-b border-gray-50 text-sm cursor-pointer transition-colors ${isSel ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
        <td className="px-2 py-3 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.has(c.id)}
            onChange={() => toggleSelected(c.id)}
            className="rounded border-gray-300"
          />
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{`${(c.firstName?.[0] ?? '')}${(c.lastName?.[0] ?? '')}`}</span>
            <span>{c.firstName} {c.lastName}{c.isInternal && <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 align-middle">Internal</span>}{c.screenRecommendation === 'review' && c.currentStage !== 'Rejected' && c.currentStage !== 'Hired' && c.currentStage !== 'Not Selected' && <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-red-100 text-red-700 align-middle" title="Below the auto-advance bar — awaiting human review in the Review tab">Review</span>}{needsAction(c) && <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 align-middle font-medium" title={needsActionReason(c)}>Needs action</span>}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-500">{c.email}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_COLORS[c.currentStage] ?? ''}`}>{c.currentStage}</span>
        </td>
        <td className="px-4 py-3 text-gray-500">{c.ccatScore ?? '\u2014'}</td>
        <td className="px-4 py-3 text-gray-500">{c.eppValuesMatchScore != null ? `${c.eppValuesMatchScore}%` : '\u2014'}</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            {getPrevStage(c) && (
              <button onClick={() => advanceMutation.mutate({ id: c.id, toStage: getPrevStage(c)! })} disabled={advanceMutation.isLoading} className="p-1 text-gray-400 hover:text-amber-600 transition-colors" title={`Move back to ${getPrevStage(c)}`}>
                <ChevronLeft size={16} />
              </button>
            )}
            {nextStage && (
              <button onClick={() => advanceMutation.mutate({ id: c.id, toStage: nextStage })} disabled={advanceMutation.isLoading} className="p-1 text-gray-400 hover:text-green-600 transition-colors" title={`Advance to ${nextStage}`}>
                <ChevronRight size={16} />
              </button>
            )}
            {c.currentStage !== 'Rejected' && c.currentStage !== 'Hired' && c.currentStage !== 'Not Selected' ? (
              <button onClick={() => setRejectingId(c.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Reject — asks for a reason">
                <Ban size={15} />
              </button>
            ) : (
              <button onClick={() => doDelete(c.id)} disabled={deleteMutation.isLoading} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete permanently (no rejection record)">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {isSel && (
        <tr>
          <td colSpan={7} className="p-0 bg-gray-50/40 border-b border-gray-200">
            <div className="px-5 py-5">
              <CandidateDetail
                candidate={c}
                wsApplicable={requiresWorkSample(c)}
                nextStage={nextStage}
                prevStage={getPrevStage(c)}
                onReject={(id: string) => setRejectingId(id)}
                onChanged={refetch}
              />
            </div>
          </td>
        </tr>
      )}
      </Fragment>
    );
  };

  // Render one role card (funnel + expandable roster + closed-out list).
  // Shared by the open-role list and the collapsed "Closed roles" section.
  const renderRoleCard = (g: any) => {
    const collapsed = collapsedRoles[g.jdId] ?? true;
    const maxN = Math.max(1, ...FUNNEL_STAGES.map((st) => g.counts[st] ?? 0));
    return (
                <div key={g.jdId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => toggleRole(g.jdId)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ChevronDown size={16} className={`text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                          <span className="text-base font-semibold text-gray-900">{g.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-gray-500 flex-wrap">
                          {g.dept && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{g.dept}</span>}
                          {g.hm && <span>{g.hm}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 ml-6">
                      {FUNNEL_STAGES.map((st) => {
                        const n = g.counts[st] ?? 0;
                        const h = Math.max(3, Math.round((n / maxN) * 28));
                        return (
                          <div key={st} className="flex-1 text-center" title={`${st}: ${n}`}>
                            <div className="text-sm font-semibold text-gray-900">{n}</div>
                            <div className="mx-auto my-1 rounded" style={{ height: `${h}px`, background: n ? '#93b5e8' : '#eef1f5' }} />
                            <div className="text-[10px] text-gray-400 leading-tight">{st}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {!collapsed && g.cands.length === 0 && g.closed.length === 0 && (
                    <div className="border-t border-gray-100 px-4 py-4 text-sm text-gray-500">
                      No candidates in this role yet. Use <span className="font-medium text-gray-700">Add Candidate</span> and pick this role to start its pipeline.
                    </div>
                  )}
                  {!collapsed && g.jdId !== 'none' && g.cands.length > 0 && <RoleRankingDropdown jdId={g.jdId} />}
                  {!collapsed && g.cands.length > 0 && (
                    <div className="border-t border-gray-100 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                            <th className="px-2 py-2.5 w-8"></th>
                            <th className="px-4 py-2.5">Name</th>
                            <th className="px-4 py-2.5">Email</th>
                            <th className="px-4 py-2.5">Stage</th>
                            <th className="px-4 py-2.5">CCAT</th>
                            <th className="px-4 py-2.5">Role Fit Match</th>
                            <th className="px-4 py-2.5 w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.cands.map((c: any) => candidateRow(c))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!collapsed && g.closed.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <button
                        onClick={() => setOpenClosed((m) => ({ ...m, [g.jdId]: !m[g.jdId] }))}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
                      >
                        <ChevronDown size={15} className={`text-gray-400 transition-transform ${openClosed[g.jdId] ? '' : '-rotate-90'}`} />
                        <Archive size={15} className="text-gray-400" />
                        <span>Closed out</span>
                        <span className="text-gray-400 font-normal">· {g.closed.length}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {g.closed.filter((c: any) => c.currentStage === 'Rejected').length > 0 && (
                            <span className="inline-flex px-2 py-0.5 text-[11px] rounded-full bg-red-100 text-red-700">
                              {g.closed.filter((c: any) => c.currentStage === 'Rejected').length} rejected
                            </span>
                          )}
                          {g.closed.filter((c: any) => c.currentStage === 'Not Selected').length > 0 && (
                            <span className="inline-flex px-2 py-0.5 text-[11px] rounded-full bg-gray-200 text-gray-600">
                              {g.closed.filter((c: any) => c.currentStage === 'Not Selected').length} not selected
                            </span>
                          )}
                        </span>
                      </button>
                      {openClosed[g.jdId] && (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full">
                            <tbody>
                              {g.closed.map((c: any) => (
                                <tr key={c.id} className="border-b border-gray-50 text-sm">
                                  <td className="px-2 py-2 w-8">
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(c.id)}
                                      onChange={() => toggleSelected(c.id)}
                                      className="rounded border-gray-300"
                                    />
                                  </td>
                                  <td className="px-2 py-2 font-medium text-gray-700">
                                    <span className="inline-flex items-center gap-1.5">
                                      {c.firstName} {c.lastName}
                                      {c.currentStage === 'Rejected' && (
                                        <button
                                          onClick={() => unrejectMutation.mutate({ id: c.id })}
                                          disabled={unrejectMutation.isLoading}
                                          className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                                          title="Unreject — restore to previous stage"
                                        >
                                          <RotateCcw size={13} />
                                        </button>
                                      )}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2">
                                    <span className={`inline-flex px-2 py-0.5 text-[11px] rounded-full ${STAGE_COLORS[c.currentStage] ?? 'bg-gray-100 text-gray-600'}`}>
                                      {c.currentStage}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-gray-400 text-xs">{c.email}</td>
                                  <td className="px-2 py-2 text-gray-400 text-xs">{c.rejectionReason ?? ''}</td>
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      onClick={() => doDelete(c.id)}
                                      disabled={deleteMutation.isLoading}
                                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                      title="Delete (build tool)"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
    );
  };

  return (
    <div className="flex gap-4">
      {/* Main panel */}
      <div className={selectedId ? 'flex-1 min-w-0' : 'w-full'}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
            <p className="text-gray-500 text-sm mt-1">Track every applicant through the pipeline</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600"
          >
            <Plus size={16} />
            Add Candidate
          </button>
        </div>

        {/* Bulk action bar — appears once candidates are selected via checkbox */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-100 flex-wrap">
            <span className="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
            <select
              value={bulkMoveTarget}
              onChange={(e) => setBulkMoveTarget(e.target.value as Stage | '')}
              className="px-2 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
            >
              <option value="">Move to stage...</option>
              {STAGES.filter((s) => s !== 'Not Selected').map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={doBulkMove}
              disabled={!bulkMoveTarget || bulkAdvanceMutation.isLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-ls-primary text-white font-medium hover:bg-ls-primary-600 disabled:opacity-50"
            >
              {bulkAdvanceMutation.isLoading ? 'Moving...' : 'Move'}
            </button>
            <button
              onClick={() => setRejectingId(BULK_REJECT)}
              className="px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-700 font-medium hover:bg-red-50"
            >
              Reject
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">
              Clear selection
            </button>
          </div>
        )}

        <TimelineAlerts />

        {/* Stage filter — single dropdown instead of an open chip row */}
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="stage-filter" className="text-xs font-medium text-gray-500">Stage</label>
          <select
            id="stage-filter"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as Stage | '')}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          >
            <option value="">All stages</option>
            {STAGES.filter((s) => s !== 'Rejected' && s !== 'Not Selected').map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label htmlFor="sort-order" className="ml-3 text-xs font-medium text-gray-500">Sort</label>
          <select
            id="sort-order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          >
            <option value="newest">Newest applied first</option>
            <option value="oldest">Oldest applied first</option>
          </select>
        </div>

        {/* Internal / external filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'external', 'internal'] as const).map((v) => (
            <button key={v} onClick={() => setInternalFilter(v)}
              className={`px-3 py-1 text-xs rounded-full border ${internalFilter === v ? 'bg-ls-primary text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}>
              {v === 'all' ? 'All applicants' : v === 'internal' ? 'Internal' : 'External'}
            </button>
          ))}
          <span className="w-px h-5 bg-gray-200 self-center mx-1" />
          <button
            onClick={() => setNeedsActionOnly((v) => !v)}
            title="Show only candidates the system is waiting on you to advance or reject"
            className={`px-3 py-1 text-xs rounded-full border font-medium ${needsActionOnly ? 'bg-amber-500 text-white border-amber-600' : 'border-amber-300 text-amber-700 hover:border-amber-500'}`}>
            Needs action
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-700">Add Candidate</span>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                <input type="text" value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                <input type="text" value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <select value={deptFilter} onChange={(e) => {
                    const dept = e.target.value;
                    setDeptFilter(dept);
                    const cur = ((jobDescriptions ?? []) as any[]).find((j) => j.id === form.jdId);
                    if (dept && cur && jdDeptOf(cur) !== dept) setForm({ ...form, jdId: '' });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">— All departments —</option>
                  {deptOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                <select value={form.jdId} onChange={(e) => setForm({ ...form, jdId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">— Not linked yet —</option>
                  {jdOptions.map((j) => (
                    <option key={j.id} value={j.id}>{j.jobTitle}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan">
                  <option value="">Select source</option>
                  {['LinkedIn', 'Indeed', 'Referral', 'Company Website', 'Recruiter', 'Other'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
                <input type="url" value={form.linkedinUrl}
                  onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Resume</label>
                {form.resumeUrl && resumeFileName ? (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 border border-gray-300 rounded-md text-sm mb-2">
                    <a href={form.resumeUrl} target="_blank" rel="noreferrer" className="text-ls-primary hover:underline truncate">{resumeFileName}</a>
                    <button type="button" onClick={() => { setForm({ ...form, resumeUrl: '', resumeText: '' }); setResumeFileName(''); setResumeUploadError(null); }} className="text-xs text-gray-400 hover:text-red-600 shrink-0">Remove</button>
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm cursor-pointer hover:border-gray-500 mb-2 ${uploadingResume ? 'opacity-60 pointer-events-none' : ''}`}>
                    <span className="text-gray-600">{uploadingResume ? 'Uploading\u2026' : 'Upload resume (PDF, Word, or text)'}</span>
                    <input type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); e.target.value = ''; }} />
                  </label>
                )}
                {resumeUploadError && <p className="text-xs text-amber-600 mb-2">{resumeUploadError}</p>}
                <p className="text-[11px] text-gray-400">PDF, Word (.docx) or text. The resume screen reads the uploaded file's text, so a real upload (not a link) is required.</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">References</label>
                  <button type="button"
                    onClick={() => setForm({ ...form, references: [...form.references, { name: '', email: '', relationship: '' }] })}
                    className="text-xs font-semibold text-ls-primary hover:underline">+ Add reference</button>
                </div>
                {form.references.length === 0 ? (
                  <p className="text-[11px] text-gray-400">Optional. Add references the candidate provided — you&apos;ll check them at the Reference Check stage.</p>
                ) : (
                  <div className="space-y-2">
                    {form.references.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <input value={r.name} placeholder="Name"
                          onChange={(e) => { const refs = [...form.references]; refs[i] = { ...refs[i], name: e.target.value }; setForm({ ...form, references: refs }); }}
                          className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                        <input type="email" value={r.email} placeholder="Email"
                          onChange={(e) => { const refs = [...form.references]; refs[i] = { ...refs[i], email: e.target.value }; setForm({ ...form, references: refs }); }}
                          className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                        <input value={r.relationship} placeholder="Relationship (e.g. Former manager)"
                          onChange={(e) => { const refs = [...form.references]; refs[i] = { ...refs[i], relationship: e.target.value }; setForm({ ...form, references: refs }); }}
                          className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
                        <button type="button" title="Remove reference"
                          onClick={() => setForm({ ...form, references: form.references.filter((_, j) => j !== i) })}
                          className="text-gray-400 hover:text-red-600 px-1 text-sm">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.needsSponsorship}
                    onChange={(e) => setForm({ ...form, needsSponsorship: e.target.checked })}
                  />
                  Requires international sponsorship (candidate self-reports on the application — auto-declines on submit)
                </label>
              </div>
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isInternal} onChange={(e) => setForm({ ...form, isInternal: e.target.checked })} />
                Internal candidate (current Lightspeed employee)
              </label>
              {form.isInternal && (
                <input value={form.internalEmployee} onChange={(e) => setForm({ ...form, internalEmployee: e.target.value })}
                  placeholder="Current role / manager (optional)"
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => createMutation.mutate({
                  ...form,
                  jdId: form.jdId || undefined,
                  references: form.references
                    .filter((r) => r.name.trim() && r.email.trim())
                    .map((r) => ({ name: r.name.trim(), email: r.email.trim(), relationship: r.relationship.trim() || undefined })),
                })}
                disabled={!form.firstName || !form.lastName || !form.email || createMutation.isLoading}
                className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50"
              >
                {createMutation.isLoading ? 'Adding...' : 'Add Candidate'}
              </button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Reject modal — doubles as the bulk-reject prompt when rejectingId is the BULK_REJECT sentinel */}
        {rejectingId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg border border-gray-200 p-5 w-96">
              <div className="text-sm font-semibold text-gray-700 mb-3">
                {rejectingId === BULK_REJECT ? `Reject ${selectedIds.size} Candidates` : 'Reject Candidate'}
              </div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                rows={3} placeholder="e.g. CCAT score below threshold, not the right fit..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan mb-3" />
              <div className="flex gap-2">
                <button
                  onClick={() => rejectingId === BULK_REJECT
                    ? bulkRejectMutation.mutate({ ids: Array.from(selectedIds), reason: rejectReason })
                    : rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
                  disabled={!rejectReason || rejectMutation.isLoading || bulkRejectMutation.isLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {(rejectMutation.isLoading || bulkRejectMutation.isLoading) ? 'Rejecting...' : 'Reject'}
                </button>
                <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Reject undo window — the rejection email is delayed 2 min server-side;
            Undo here (unreject) cancels it before it sends. */}
        {rejectNotice && (
          <div className="fixed bottom-4 right-4 z-[60] w-80 bg-white border border-gray-200 shadow-xl rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Ban size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800">
                  {rejectNotice.ids.length > 1 ? `${rejectNotice.ids.length} candidates rejected` : 'Candidate rejected'}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  Rejection {rejectNotice.ids.length > 1 ? 'emails send' : 'email sends'} in{' '}
                  <span className="font-semibold tabular-nums text-gray-800">{rejectCountdown(rejectNotice.expiresAt)}</span>. Undo now to stop {rejectNotice.ids.length > 1 ? 'them' : 'it'} going out.
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={undoReject}
                    disabled={unrejectMutation.isLoading}
                    className="px-3 py-1.5 bg-ls-primary text-white rounded-md text-xs font-medium hover:bg-ls-primary-600 disabled:opacity-50"
                  >
                    Undo{rejectNotice.ids.length > 1 ? ' all' : ''}
                  </button>
                  <button onClick={() => setRejectNotice(null)} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700">Dismiss</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open roles</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{openRoleCount}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">In pipeline</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{visibleCandidates.length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Offers out</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{visibleCandidates.filter((c: any) => c.currentStage === 'Offer').length}</div>
          </div>
        </div>

        {/* Role search — find the open role you want to view */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Search open roles…"
              className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan"
            />
            {roleSearch && (
              <button type="button" onClick={() => setRoleSearch('')} aria-label="Clear role search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          {roleQuery && (
            <span className="text-xs text-gray-500">{visibleRoleGroups.length} of {roleGroups.length} roles</span>
          )}
        </div>

        {visibleRoleGroups.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">{roleQuery ? `No roles match “${roleSearch.trim()}”.` : 'No candidates found.'}</div>
        ) : (
          <div className="space-y-3">
            {openRoleGroups.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-400 text-sm">No open roles right now.</div>
            ) : (
              openRoleGroups.map((g) => renderRoleCard(g))
            )}
            {closedRoleGroups.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowClosedRoles((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors border border-gray-200"
                >
                  <ChevronDown size={15} className={`text-gray-400 transition-transform ${showClosedRoles ? '' : '-rotate-90'}`} />
                  <Archive size={15} className="text-gray-400" />
                  <span>Closed roles</span>
                  <span className="text-gray-400 font-normal">· {closedRoleGroups.length}</span>
                  <span className="ml-auto text-xs text-gray-400 font-normal">closed, filled, or not actively open</span>
                </button>
                {showClosedRoles && (
                  <div className="space-y-3 mt-3">
                    {closedRoleGroups.map((g) => renderRoleCard(g))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}

// ── Pipeline stage accordion (inline candidate detail) ─────
// Per-stage detail body. The underlying stage enum is unchanged; this reads
// real candidate fields + interview rounds and links out where the app already
// has a destination (assessment, scorecards, Interviews tab).
function stageDetail(name: string, c: any, rounds: any[], onChanged: () => void): React.ReactNode {
  switch (name) {
    case 'Applied':
      return (
        <div className="space-y-3">
          <div>Applied {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}{c.source ? ` · Source: ${c.source}` : ''}.</div>
          <EeoInviteSection candidateId={c.id} />
        </div>
      );
    case 'Assessment':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-gray-200 rounded-lg p-2.5"><div className="text-[10px] uppercase tracking-wide text-gray-500">CCAT</div><div className="text-base font-bold text-gray-900">{c.ccatScore ?? '—'}<span className="text-xs text-gray-400">/50</span></div></div>
            <div className="bg-white border border-gray-200 rounded-lg p-2.5"><div className="text-[10px] uppercase tracking-wide text-gray-500">Percentile</div><div className="text-base font-bold text-gray-900">{c.ccatPercentile != null ? `${c.ccatPercentile}th` : '—'}</div></div>
            <div className="bg-white border border-gray-200 rounded-lg p-2.5"><div className="text-[10px] uppercase tracking-wide text-gray-500">Role Fit Match</div><div className="text-base font-bold text-gray-900">{c.eppValuesMatchScore != null ? `${c.eppValuesMatchScore}%` : '—'}</div></div>
          </div>
          {(c.ccatVerbal != null || c.ccatMathLogic != null || c.ccatSpatial != null) && (
            <div className="text-gray-500">Verbal <b className="text-gray-700">{c.ccatVerbal ?? '—'}</b> · Math &amp; Logic <b className="text-gray-700">{c.ccatMathLogic ?? '—'}</b> · Spatial <b className="text-gray-700">{c.ccatSpatial ?? '—'}</b></div>
          )}
          <a href={`/hiring/assessments?id=${c.id}`} className="inline-flex items-center gap-1 text-ls-primary font-semibold border border-dashed border-ls-primary rounded-md px-2.5 py-1">See assessment →</a>
        </div>
      );
    case 'Candidate Review':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border border-gray-200 rounded-lg p-2.5"><div className="text-[10px] uppercase tracking-wide text-gray-500">Role Fit Match</div><div className="text-base font-bold text-gray-900">{c.eppValuesMatchScore != null ? `${c.eppValuesMatchScore}%` : '—'}</div></div>
            <div className="bg-white border border-gray-200 rounded-lg p-2.5"><div className="text-[10px] uppercase tracking-wide text-gray-500">Resume Review</div><div className="text-base font-bold text-gray-900">{c.resumeReviewScore ?? '—'}</div></div>
          </div>
          <ResumeRequirements checks={(c as any).resumeRequirementChecks} />
          {c.companyValuesNotes ? (
            <div><div className="font-semibold text-gray-700 mb-0.5">Role-fit notes</div><div className="whitespace-pre-wrap">{c.companyValuesNotes}</div></div>
          ) : null}
          <CombinedScreenSection candidateId={c.id} existingSummary={c.screenSummary ?? null} onChanged={onChanged} defaultOpen resumeUrl={c.resumeUrl ?? null} hasStoredResume={!!c.resumeText} />
        </div>
      );
    case 'Phone Screen':
      return <PhoneScreenSchedulingSection candidate={c} onChanged={onChanged} defaultOpen />;
    case 'Interview': {
      if (!rounds.length) return <div className="text-gray-400 italic">No interview rounds for this req yet.</div>;
      return (
        <div className="space-y-2">
          {rounds.map((r: any, i: number) => {
            const prev = rounds[i - 1];
            const priorFu: any[] = Array.isArray(prev?.followUps) ? prev.followUps : [];
            const fu: any[] = Array.isArray(r.followUps) ? r.followUps : [];
            return (
              <details key={r.id} className="border border-gray-200 rounded-md bg-white">
                <summary className="cursor-pointer px-3 py-2 flex items-center gap-2">
                  <span className="font-semibold text-gray-900 flex-1">{r.roundName}</span>
                  <span className="text-[11px] text-gray-500">{r.interviewerName ?? ''}</span>
                  {r.scheduledAt ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ {new Date(r.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  ) : r.status === 'candidate_proposed' ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Needs outreach</span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Awaiting time</span>
                  )}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.feedbackHr ? 'bg-ls-primary/10 text-ls-primary' : 'bg-gray-100 text-gray-400'}`}>{r.feedbackHr ? 'Scorecard ✓' : 'No scorecard'}</span>
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  {!r.scheduledAt && r.status === 'candidate_proposed' && <InterviewRoundReachOut round={r} candidate={c} onChanged={onChanged} />}
                  <div><div className="font-semibold text-gray-700 uppercase text-[10px] tracking-wide mb-0.5">Briefing that was sent in</div><div className="text-gray-500">{i === 0 ? 'Resume + assessment context (first round).' : (priorFu.length ? `Compiled from ${prev.roundName}: ${priorFu.map((f: any) => f.text).join('; ')}` : `Compiled from ${prev.roundName}.`)}</div></div>
                  <div><div className="font-semibold text-gray-700 uppercase text-[10px] tracking-wide mb-0.5">Feedback received</div><div className="whitespace-pre-wrap">{r.feedbackHr ? r.feedbackHr : <span className="text-gray-400 italic">No written feedback yet.</span>}</div></div>
                  <div><div className="font-semibold text-gray-700 uppercase text-[10px] tracking-wide mb-0.5">Briefing crafted for next round</div>{fu.length ? <ul className="list-disc ml-4">{fu.map((f: any, k: number) => <li key={k}>{f.text}</li>)}</ul> : <div className="text-gray-400 italic">No follow-ups.</div>}</div>
                  <div><div className="font-semibold text-gray-700 uppercase text-[10px] tracking-wide mb-0.5">Scorecard</div>{r.feedbackHr ? <a href={`/hiring/scorecards?id=${c.id}&round=${r.id}`} className="text-ls-primary font-semibold underline">View scorecard →</a> : <span className="text-gray-400 italic">No scorecard filled yet.</span>}</div>
                </div>
              </details>
            );
          })}
        </div>
      );
    }
    case 'Work Sample':
      return (
        <div className="space-y-2">
          <WalkthroughSchedulingSection candidate={c} onChanged={onChanged} />
          <div className="bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 text-[11px] text-amber-800">AI grade is advisory — it never advances or rejects on its own. A human reviews it and decides.</div>
          <div className="flex gap-4 flex-wrap">
            <span>AI grade: <b className="text-gray-900">{c.workSampleScore != null ? `${c.workSampleScore}/100` : '—'}</b></span>
            <span>Submitted: <b className="text-gray-900">{c.workSampleSubmittedAt ? new Date(c.workSampleSubmittedAt).toLocaleDateString() : 'not yet'}</b></span>
          </div>
          {c.workSampleNotes ? <div className="whitespace-pre-wrap max-h-40 overflow-y-auto bg-white border border-gray-200 rounded p-2">{c.workSampleNotes}</div> : null}
          <div className="text-gray-400">Full submission, re-score, and manual score/notes are in the Work Sample section below.</div>
        </div>
      );
    case 'Reference Check':
      return <ReferenceCheckSection candidate={c} onChanged={onChanged} />;
    case 'Offer':
      // Render the actual offer-letter workflow inline (internal move vs external
      // hire), open by default, so there's an actionable review/send control right
      // here — previously this was static text pointing at an "Offer section below"
      // that was never mounted, leaving no way forward but the manual arrows.
      return c.isInternal
        ? <InternalOfferSection candidateId={c.id} onChanged={onChanged} defaultOpen />
        : <OfferSection candidateId={c.id} onChanged={onChanged} defaultOpen />;
    case 'Hired':
      return <div className="text-gray-400 italic">Final stage.</div>;
    default:
      return null;
  }
}

// One reference row on the Reference Check card. Each reference carries its own
// outcome (cleared / concerns / failed) plus an optional note, saved on its own
// via candidates.recordReferenceItemOutcome. This is the per-reference record; it
// does NOT move the candidate — the overall decision below the list does that.
function ReferenceRow({ reference, onChanged }: { reference: any; onChanged: () => void }) {
  const r = reference;
  const [note, setNote] = useState<string>(r.outcomeNotes ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  const LABEL: Record<string, string> = { cleared: 'Cleared', concerns: 'Concerns', failed: 'Failed' };
  const record = trpc.candidates.recordReferenceItemOutcome.useMutation({ onSuccess: onChanged });
  const pillStyle = (o: string, active: boolean) => {
    if (!active) return 'bg-white text-gray-700 border-gray-300 hover:border-gray-400';
    if (o === 'cleared') return 'bg-emerald-500 text-white border-emerald-500';
    if (o === 'failed') return 'bg-rose-600 text-white border-rose-600';
    return 'bg-amber-500 text-white border-amber-500';
  };
  const save = (outcome: 'cleared' | 'concerns' | 'failed') =>
    record.mutate({ referenceId: r.id, outcome, notes: note.trim() || undefined });
  return (
    <li className="bg-white border border-gray-200 rounded px-2.5 py-2 space-y-1.5">
      <div className="text-[13px]">
        <span className="font-semibold text-gray-900">{r.name}</span>
        {r.relationship ? <span className="text-gray-500"> · {r.relationship}</span> : null}
        <span className="text-gray-400"> · {r.email}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['cleared', 'concerns', 'failed'] as const).map((o) => (
          <button
            key={o}
            type="button"
            disabled={record.isLoading}
            onClick={() => save(o)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${pillStyle(o, r.outcome === o)}`}
          >
            {LABEL[o]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          className="text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2 ml-1"
        >
          {r.outcomeNotes || noteOpen ? 'Note' : 'Add note'}
        </button>
        {record.isLoading && <span className="text-[11px] text-gray-400">Saving…</span>}
      </div>
      {(noteOpen || (r.outcomeNotes && !noteOpen)) && (
        <div className="flex items-start gap-1.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for this reference (optional)"
            className="flex-1 text-[12px] border border-gray-300 rounded px-2 py-1 min-h-[38px]"
          />
          <button
            type="button"
            disabled={record.isLoading || !r.outcome}
            title={!r.outcome ? 'Pick an outcome first' : 'Save note'}
            onClick={() => r.outcome && save(r.outcome)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${record.isLoading || !r.outcome ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-ls-primary text-white hover:opacity-90'}`}
          >
            Save
          </button>
        </div>
      )}
      {record.error && <div className="text-[11px] text-rose-600">{record.error.message}</div>}
    </li>
  );
}

// Reference Check decision gate. References are checked off-system; the recorder
// marks each reference (cleared / concerns / failed) and then records a single
// final decision: Pass advances the candidate to the Offer stage (the recruiter
// then sends the offer letter from the Offer section), Fail rejects (with the
// standard rejection-email undo window). Pass/Fail map to the backend outcome
// enum's 'cleared'/'failed'; the 'concerns' hold path is no longer offered here.
function ReferenceCheckSection({ candidate, onChanged }: { candidate: any; onChanged: () => void }) {
  const c = candidate;
  // The final decision is Advance or Reject, taken directly from this section.
  // Advance promotes to Offer and Reject rejects — both go through
  // recordReferenceOutcome (cleared / failed) so the decision and any note are
  // logged. (Per-reference marks below can still be cleared / concerns / failed.)
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState<'cleared' | 'failed' | null>(null);
  const record = trpc.candidates.recordReferenceOutcome.useMutation({
    onSuccess: () => { setNotes(''); setPending(null); onChanged(); },
    onError: () => setPending(null),
  });
  const refs = trpc.candidates.references.useQuery({ id: c.id });
  const refList: any[] = (refs.data as any[]) ?? [];
  // Display label for a previously-recorded outcome. New decisions store cleared/failed;
  // 'concerns' can only appear on legacy records made before this became Advance/Reject.
  const PRIOR_LABEL: Record<string, string> = { cleared: 'Advanced to Offer', failed: 'Rejected', concerns: 'Concerns' };
  const prior = c.referenceOutcome as string | null;
  const decide = (outcome: 'cleared' | 'failed') => {
    setPending(outcome);
    record.mutate({ id: c.id, outcome, notes: notes.trim() || undefined });
  };
  return (
    <div className="space-y-3">
      <div className="text-gray-500">Reference checks are done manually. Mark each reference below, then record the final decision — Pass advances to Offer, Fail rejects.</div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">References provided ({refList.length})</div>
        {refList.length === 0 ? (
          <div className="text-gray-400 italic text-[12px]">No references were captured for this candidate. They can be added on the candidate&apos;s intake form.</div>
        ) : (
          <ul className="space-y-2">
            {refList.map((r) => (
              <ReferenceRow key={r.id} reference={r} onChanged={() => { refs.refetch(); onChanged(); }} />
            ))}
          </ul>
        )}
      </div>
      {prior && (
        <div className="text-[12px] bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
          Last recorded: <b>{PRIOR_LABEL[prior] ?? prior}</b>{c.referenceNotes ? <> — {c.referenceNotes}</> : null}
          {c.referenceDecidedAt ? <span className="text-gray-400"> ({new Date(c.referenceDecidedAt).toLocaleDateString()})</span> : null}
        </div>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 -mb-1">Final decision</div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 min-h-[60px]"
      />
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={record.isLoading}
          onClick={() => decide('cleared')}
          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white disabled:opacity-50"
        >
          {pending === 'cleared' ? 'Advancing…' : 'Advance'}
        </button>
        <button
          type="button"
          disabled={record.isLoading}
          onClick={() => decide('failed')}
          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-red-400 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50"
        >
          {pending === 'failed' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      <div className="text-[11px] text-gray-400">Advance promotes to Offer (you send the offer letter next); Reject sends the rejection email after a short undo window.</div>
      {record.error && <div className="text-[12px] text-rose-600">{record.error.message}</div>}
    </div>
  );
}

function PipelineStages({ candidate, wsApplicable, nextStage, onAdvance, onReject, advancing, onChanged }: {
  candidate: any;
  wsApplicable: boolean;
  nextStage: string | null;
  onAdvance: (toStage: string) => void;
  onReject: () => void;
  advancing: boolean;
  onChanged: () => void;
}) {
  const c = candidate;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data: rounds } = trpc.interviews.list.useQuery({ candidateId: c.id });
  const roundList: any[] = (rounds as any[]) ?? [];
  const curIdx = STAGES.indexOf(c.currentStage as Stage);
  const closed = c.currentStage === 'Rejected' || c.currentStage === 'Not Selected';
  const flow = STAGES.filter((s) => s !== 'Rejected' && s !== 'Not Selected' && !(s === 'Work Sample' && !wsApplicable));

  return (
    <div>
      {closed && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-100">
          Candidate is {c.currentStage}. Pipeline advancement is closed.
        </div>
      )}
      {flow.map((name, i) => {
        const idx = STAGES.indexOf(name);
        const done = curIdx >= 0 && idx < curIdx;
        const current = idx === curIdx;
        const isOpen = current || !!open[name];
        return (
          <div key={name} className={`border rounded-lg mb-2 overflow-hidden ${done ? 'bg-emerald-50/60 border-emerald-100' : current ? 'border-ls-primary ring-1 ring-ls-primary' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none" onClick={() => setOpen((m) => ({ ...m, [name]: !m[name] }))}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : current ? 'bg-ls-primary text-white' : 'bg-gray-100 text-gray-400'}`}>{done ? <Check size={13} /> : i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">{stageLabel(name)}{name === 'Work Sample' && <span className="ml-1 text-[10px] text-gray-400">(if applicable)</span>}</div>
                <div className="text-[11px] text-gray-500">{done ? 'Completed' : current ? 'Awaiting your decision' : 'Upcoming'}</div>
              </div>
              {done ? (
                <Check size={16} className="text-emerald-600 shrink-0" />
              ) : current && !closed && name !== 'Reference Check' ? (
                // Reference Check takes its Advance/Reject from the Final decision
                // controls inside the section body, so the header omits them here.
                <span className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {nextStage && (
                    <button onClick={() => onAdvance(nextStage as string)} disabled={advancing} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white disabled:opacity-50">Advance</button>
                  )}
                  <button onClick={onReject} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-red-400 text-red-500 hover:bg-red-500 hover:text-white">Reject</button>
                </span>
              ) : null}
              <ChevronRight size={14} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </div>
            {isOpen && (
              <div className="px-4 pb-4 pl-11 text-xs text-gray-600">
                {stageDetail(name, c, roundList, onChanged)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CandidateDetail({ candidate, wsApplicable, nextStage, onReject, onChanged }: {
  candidate: any;
  wsApplicable: boolean;
  nextStage: string | null;
  prevStage: string | null;
  onReject: (id: string) => void;
  onChanged: () => void;
}) {
  const c = candidate;
  const advance = trpc.candidates.advanceStage.useMutation({ onSuccess: onChanged });
  const update = trpc.candidates.update.useMutation({ onSuccess: onChanged });

  const action = needsAction(c) ? needsActionInfo(c) : null;

  return (
    <div className="w-full">
      {action && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3" role="status">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700 font-medium shrink-0 uppercase tracking-wide">Needs action</span>
            <div>
              <div className="text-sm font-semibold text-amber-800">{action.headline}</div>
              <p className="text-xs text-amber-700 mt-0.5">{action.detail}</p>
            </div>
          </div>
        </div>
      )}
      <PipelineStages
        candidate={c}
        wsApplicable={wsApplicable}
        nextStage={nextStage}
        onAdvance={(to: string) => advance.mutate({ id: c.id, toStage: to as Stage })}
        onReject={() => onReject(c.id)}
        advancing={advance.isLoading}
        onChanged={onChanged}
      />

      <div className="mt-5">
        <Section title="General Notes">
          <EditableTextarea label="Notes" value={c.notes ?? ''} onSave={(v) => update.mutate({ id: c.id, notes: v })} />
        </Section>
        <DecisionHistorySection key={`dh-${c.id}`} candidateId={c.id} />
      </div>
    </div>
  );
}

// ── Decision history (Phase 2 provenance) ──────────────────
const DECISION_LABELS: Record<string, string> = {
  assessment_gate: 'Assessment gate',
  post_assessment_review: 'Post-assessment review',
  resume_screen: 'Resume screen',
  work_sample: 'Work sample',
  interview_questions: 'Interview questions',
  interview_feedback: 'Interview feedback',
  manual_stage_change: 'Manual stage change',
};

function outcomeClasses(outcome: string): string {
  switch (outcome) {
    case 'passed':
    case 'advanced': return 'bg-green-100 text-green-700';
    case 'rejected':
    case 'failed': return 'bg-red-100 text-red-700';
    case 'pending_review': return 'bg-amber-100 text-amber-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

const EEO_STATUS_LABEL: Record<string, string> = {
  not_sent: 'Not taken', invited: 'Invited (awaiting response)', completed: 'Taken', submitted: 'Taken', declined: 'Declined',
};
export function EeoInviteSection({ candidateId }: { candidateId: string }) {
  const { data, refetch } = trpc.eeo.status.useQuery({ candidateId });
  const invite = trpc.eeo.invite.useMutation({ onSuccess: () => refetch() });
  const markCompleted = trpc.eeo.markCompleted.useMutation({ onSuccess: () => refetch() });
  const status = data?.status ?? 'not_sent';
  const taken = status === 'completed' || status === 'submitted';
  const sent = status === 'invited' || taken || status === 'declined';
  return (
    <Section title="Voluntary self-ID survey">
      <div className="text-xs text-gray-500 mb-2">
        Voluntary EEO self-identification, used only in aggregate for the fairness audit. Responses are
        confidential and never shown here or to anyone making hiring decisions. You only see whether it was taken.
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${taken ? 'bg-green-100 text-green-700' : status === 'declined' ? 'bg-gray-100 text-gray-600' : status === 'invited' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
          {EEO_STATUS_LABEL[status] ?? status}
        </span>
        <button
          onClick={() => invite.mutate({ candidateId })}
          className="text-xs px-3 py-1.5 rounded-md bg-ls-primary text-white hover:opacity-90 disabled:opacity-40"
          disabled={invite.isLoading || taken}>
          {invite.isLoading ? 'Sending...' : sent ? 'Resend survey' : 'Send self-ID survey'}
        </button>
        {!taken && (
          <button
            onClick={() => markCompleted.mutate({ candidateId })}
            className="text-xs px-3 py-1.5 rounded-md border border-green-600 text-green-700 hover:bg-green-600 hover:text-white disabled:opacity-40"
            disabled={markCompleted.isLoading}>
            {markCompleted.isLoading ? 'Marking...' : 'Mark as taken'}
          </button>
        )}
      </div>
    </Section>
  );
}

export function DecisionHistorySection({ candidateId }: { candidateId: string }) {
  const { data: decisions, isLoading } = trpc.decisions.listByCandidate.useQuery({ candidateId });

  return (
    <Section title="Decision History">
      <div className="text-xs text-gray-500 mb-2">
        Every automated, rule-based, and human decision for this candidate — with the model and prompt version
        that produced it, and a plain-language reason. Read-only audit trail.
      </div>
      {isLoading && <div className="text-xs text-gray-400">Loading…</div>}
      {!isLoading && (!decisions || decisions.length === 0) && (
        <div className="text-xs text-gray-400">No decisions recorded yet for this candidate.</div>
      )}
      <div className="space-y-2">
        {(decisions ?? []).map((d: any) => (
          <div key={d.id} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-medium text-gray-900">{DECISION_LABELS[d.decisionType] ?? d.decisionType}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${outcomeClasses(d.outcome)}`}>{d.outcome}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                {d.decidedByType === 'ai' ? 'AI' : d.decidedByType === 'human' ? 'Human' : 'Rule'}
              </span>
              <span className="flex-1" />
              <span className="text-[11px] text-gray-400">{d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}</span>
            </div>
            {d.reason && <div className="text-xs text-gray-600 leading-relaxed mb-1">{d.reason}</div>}
            <div className="text-[11px] text-gray-400 font-mono">
              {d.score != null && <>score {d.score} · </>}
              {d.model ? <>{d.model}{d.promptId ? <> · prompt {d.promptId} {d.promptVersion}</> : null}</> : <>decided by {d.decidedByType}</>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Sub-components ─────────────────────────────────────────

export function InterviewFeedbackSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const run = trpc.candidates.processInterview.useMutation({
    onSuccess: (r) => { setResult(r); onChanged?.(); },
  });

  const hr = result?.feedbackHr ?? candidate.interviewFeedbackHr;
  const cand = result?.feedbackCandidate ?? candidate.interviewFeedbackCandidate;
  const interviewer = result?.feedbackInterviewer ?? candidate.interviewFeedbackInterviewer;
  const score = result?.interviewScore ?? candidate.interviewScore;
  const storedTranscript = result?.transcript ?? candidate.interviewTranscript;
  const hasAny = hr || cand || interviewer;

  return (
    <Section title="Interview Transcript & Feedback">
      <div className="text-xs text-gray-500">
        When the interview finishes, the recording is turned into a transcript and analyzed into feedback for the
        candidate, the hiring manager, and the interviewer — then the interviewer is emailed their summary. Zoom
        isn&apos;t connected yet, so paste a transcript below, or just run it to use a generated sample.
      </div>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the interview transcript here (optional — leave blank to use a generated sample)…"
        rows={4}
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono mt-1"
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => run.mutate({ id: candidate.id, transcript: transcript.trim() || undefined })}
          disabled={run.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {run.isLoading ? 'Processing…' : (hasAny ? 'Re-run feedback + email interviewer' : 'Generate feedback + email interviewer')}
        </button>
        {score != null && <span className="text-xs text-gray-600">Score: <strong>{score}/100</strong></span>}
      </div>

      {run.error && <div className="text-xs text-red-600">{run.error.message}</div>}

      {result && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 mt-1">
          Done — transcript {result.transcriptSource === 'generated' ? 'generated (sample)' : result.transcriptSource === 'provided' ? 'from your paste' : 'from stored'}.
          {' '}Interviewer summary {result.emailedInterviewer ? 'emailed' : 'not sent (no interviewer email on file)'}.
        </div>
      )}

      {interviewer && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mt-2 mb-0.5">Interviewer coaching summary</div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{interviewer}</p>
        </div>
      )}
      {hr && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mt-2 mb-0.5">Hiring-manager debrief</div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{hr}</p>
        </div>
      )}
      {cand && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mt-2 mb-0.5">Candidate-facing feedback</div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{cand}</p>
        </div>
      )}
      {storedTranscript && (
        <div className="pt-1">
          <button onClick={() => setShowTranscript((v) => !v)} className="text-xs text-ls-primary underline">
            {showTranscript ? 'Hide transcript' : 'View transcript'}
          </button>
          {showTranscript && (
            <pre className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2 mt-1 max-h-64 overflow-y-auto">{storedTranscript}</pre>
          )}
        </div>
      )}
    </Section>
  );
}


export function InterviewRoundsSection({ candidateId, onChanged }: { candidateId: string; onChanged?: () => void }) {
  const rounds = trpc.interviews.list.useQuery({ candidateId });
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [briefingFor, setBriefingFor] = useState<string | null>(null);
  const [newRound, setNewRound] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const isOpen = (id: string) => expanded[id] ?? false;

  const refresh = () => { rounds.refetch(); onChanged?.(); };
  const seed = trpc.interviews.seedFromPlan.useMutation({
    onSuccess: (result: any) => {
      const n = Array.isArray(result) ? result.length : 0;
      setSeedMsg(n === 0
        ? "No rounds are defined on this role's intake (or this candidate isn't linked to a role yet), so there was nothing to pull. Add rounds manually below."
        : null);
      refresh();
    },
  });
  const add = trpc.interviews.addRound.useMutation({ onSuccess: () => { setNewRound(''); refresh(); } });
  const update = trpc.interviews.updateRound.useMutation({ onSuccess: () => rounds.refetch() });
  const remove = trpc.interviews.removeRound.useMutation({ onSuccess: refresh });
  const record = trpc.interviews.recordFeedback.useMutation({ onSuccess: refresh });
  const sendPrep = trpc.interviews.sendPrep.useMutation({ onSuccess: () => rounds.refetch() });
  const briefing = trpc.interviews.briefing.useQuery({ id: briefingFor ?? '' }, { enabled: !!briefingFor });

  const list = (rounds.data ?? []) as any[];
  const statusStyle: Record<string, string> = {
    planned: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  };
  const followLabel: Record<string, string> = { avoided: 'Avoided', half_answered: 'Half-answered', suggested: 'Suggested' };

  return (
    <Section title="Interview Rounds">
      <div className="text-xs text-gray-500">
        Each round is tracked on its own — interviewer, transcript, score, and feedback. When you email an
        interviewer their prep, it includes the read on the candidate from earlier completed rounds (scores hidden)
        plus a follow-up list, and leaves out the coaching notes written for the earlier interviewers.
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          onClick={() => seed.mutate({ candidateId })}
          disabled={seed.isLoading}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {seed.isLoading ? 'Seeding…' : 'Seed rounds from plan'}
        </button>
        <input
          value={newRound}
          onChange={(e) => setNewRound(e.target.value)}
          placeholder="New round name (e.g. Final with VP)"
          className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[180px]"
        />
        <button
          onClick={() => newRound.trim() && add.mutate({ candidateId, roundName: newRound.trim() })}
          disabled={add.isLoading || !newRound.trim()}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
        >
          Add round
        </button>
      </div>

      {seedMsg && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">{seedMsg}</div>
      )}

      {list.length === 0 && (
        <div className="text-xs text-gray-400 pt-2">No rounds yet. Seed from the interview plan or add one.</div>
      )}

      <div className="space-y-2 pt-2">
        {list.map((r) => {
          const fus = Array.isArray(r.followUps) ? r.followUps : [];
          return (
            <div key={r.id} className="border border-gray-200 rounded p-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !(e[r.id] ?? false) }))} className="flex items-center gap-2 flex-1 text-left min-w-0">
                  <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${isOpen(r.id) ? '' : '-rotate-90'}`} />
                  <span className="text-xs font-semibold text-gray-800 truncate">{r.roundName}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusStyle[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  {r.score != null && <span className="text-[11px] text-gray-500 shrink-0">score {r.score}/100</span>}
                  {!isOpen(r.id) && r.interviewerName && <span className="text-[11px] text-gray-400 truncate">· {r.interviewerName}</span>}
                  {!isOpen(r.id) && r.prepSentAt && <span className="text-[11px] text-green-600 shrink-0">· prep emailed</span>}
                </button>
                <button onClick={() => remove.mutate({ id: r.id })} className="text-[11px] text-gray-400 hover:text-red-600 shrink-0">Remove</button>
              </div>
              {isOpen(r.id) && (<div className="mt-1.5">

              <div className="flex flex-wrap gap-2 mt-1.5">
                <input
                  defaultValue={r.interviewerName ?? ''}
                  onBlur={(e) => e.target.value !== (r.interviewerName ?? '') && update.mutate({ id: r.id, interviewerName: e.target.value || null })}
                  placeholder="Interviewer name"
                  className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[130px]"
                />
                <input
                  defaultValue={r.interviewerEmail ?? ''}
                  onBlur={(e) => e.target.value !== (r.interviewerEmail ?? '') && update.mutate({ id: r.id, interviewerEmail: e.target.value || null })}
                  placeholder="Interviewer email"
                  className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-[160px]"
                />
              </div>

              <textarea
                value={transcripts[r.id] ?? ''}
                onChange={(e) => setTranscripts((t) => ({ ...t, [r.id]: e.target.value }))}
                placeholder="Paste this round's transcript (optional — leave blank for a generated sample)…"
                rows={2}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono mt-1.5"
              />

              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <button
                  onClick={() => record.mutate({ id: r.id, transcript: (transcripts[r.id] ?? '').trim() || undefined })}
                  disabled={record.isLoading}
                  className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
                >
                  {record.isLoading ? 'Processing…' : (r.status === 'completed' ? 'Re-run feedback' : 'Record feedback')}
                </button>
                <button
                  onClick={() => sendPrep.mutate({ id: r.id })}
                  disabled={sendPrep.isLoading || !r.interviewerEmail}
                  title={r.interviewerEmail ? '' : 'Set an interviewer email first'}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Email prep + briefing
                </button>
                <button
                  onClick={() => setBriefingFor(briefingFor === r.id ? null : r.id)}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded font-medium hover:bg-gray-50"
                >
                  {briefingFor === r.id ? 'Hide briefing' : 'Preview briefing'}
                </button>
                {r.prepSentAt && <span className="text-[11px] text-green-600">prep emailed</span>}
              </div>

              {r.feedbackHr && (
                <div className="mt-1.5">
                  <div className="text-[11px] font-semibold text-gray-700">Read on the candidate</div>
                  <p className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{r.feedbackHr}</p>
                </div>
              )}
              {fus.length > 0 && (
                <div className="mt-1.5">
                  <div className="text-[11px] font-semibold text-gray-700">Follow up in later rounds</div>
                  <ul className="text-[11px] text-gray-600 list-disc pl-4">
                    {fus.map((f: any, i: number) => (
                      <li key={i}><strong>{followLabel[f.type] ?? 'Follow up'}:</strong> {f.text}</li>
                    ))}
                  </ul>
                </div>
              )}

              {briefingFor === r.id && (
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <div className="text-[11px] font-semibold text-gray-700 mb-1">Briefing this interviewer would receive</div>
                  {briefing.isLoading && <div className="text-[11px] text-gray-400">Loading…</div>}
                  {briefing.data && (briefing.data as any).talkingPoints && (
                    <div className="mb-2 rounded bg-gray-50 border border-gray-100 p-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-gray-700">Company talking points</div>
                      {(briefing.data as any).talkingPoints.whoWeAre && (<p className="text-[11px] text-gray-600 whitespace-pre-wrap">{(briefing.data as any).talkingPoints.whoWeAre}</p>)}
                      {(briefing.data as any).talkingPoints.values.length > 0 && (<div><div className="text-[10px] font-semibold text-gray-500 uppercase">Values</div><ul className="text-[11px] text-gray-600 list-disc pl-4">{(briefing.data as any).talkingPoints.values.map((v: any, i: number) => (<li key={i}><strong>{v.name}</strong>{v.pillar ? ` (${v.pillar})` : ''}{v.description ? `: ${v.description}` : ''}</li>))}</ul></div>)}
                      {(briefing.data as any).talkingPoints.departments.length > 0 && (<div><div className="text-[10px] font-semibold text-gray-500 uppercase">Departments</div><ul className="text-[11px] text-gray-600 list-disc pl-4">{(briefing.data as any).talkingPoints.departments.map((d: any, i: number) => (<li key={i}>{d.name}{d.size ? `: ${d.size}` : ''}</li>))}</ul></div>)}
                    </div>
                  )}
                  {briefing.data && briefing.data.rounds.length === 0 && briefing.data.followUps.length === 0 && (
                    <div className="text-[11px] text-gray-400">No earlier completed rounds yet — nothing to carry forward.</div>
                  )}
                  {briefing.data && briefing.data.rounds.map((b: any, i: number) => (
                    <div key={i} className="mb-1.5">
                      <div className="text-[11px] font-medium text-gray-700">{b.roundName}{b.interviewerName ? ` · ${b.interviewerName}` : ''}</div>
                      <p className="text-[11px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">{b.writtenRead}</p>
                    </div>
                  ))}
                  {briefing.data && briefing.data.followUps.length > 0 && (
                    <div className="mt-1">
                      <div className="text-[11px] font-semibold text-blue-700">Follow up in this round</div>
                      <ul className="text-[11px] text-blue-700 list-disc pl-4">
                        {briefing.data.followUps.map((f: any, i: number) => (
                          <li key={i}><strong>{followLabel[f.type] ?? 'Follow up'} ({f.roundName}):</strong> {f.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {briefing.data && (briefing.data.rounds.length > 0 || briefing.data.followUps.length > 0) && (
                    <div className="text-[10px] text-gray-400 mt-1">Scores hidden. Coaching notes for earlier interviewers are not shared.</div>
                  )}
                </div>
              )}
              </div>)}
            </div>
          );
        })}
      </div>

      {(seed.error || add.error || record.error || sendPrep.error) && (
        <div className="text-xs text-red-600 pt-1">{(seed.error || add.error || record.error || sendPrep.error)?.message}</div>
      )}
    </Section>
  );
}

function ScoreBar({ label, score, sub }: { label: string; score: number | null; sub?: string }) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = score == null ? 'bg-gray-300' : pct >= 65 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-gray-600">{score == null ? '\u2014' : `${score}/100`}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded mt-0.5"><div className={`h-1.5 rounded ${color}`} style={{ width: `${pct}%` }} /></div>
      {sub ? <div className="text-xs text-gray-400 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function CombinedScreenSection({ candidateId, existingSummary, onChanged, defaultOpen, resumeUrl, hasStoredResume }: { candidateId: string; existingSummary: string | null; onChanged?: () => void; defaultOpen?: boolean; resumeUrl?: string | null; hasStoredResume?: boolean }) {
  const [needsSponsorship, setNeedsSponsorship] = useState(false);
  const [result, setResult] = useState<any>(null);
  const screen = trpc.candidates.runScreen.useMutation({
    onSuccess: (r) => { setResult(r); onChanged?.(); },
  });

  const req = result?.requirements;
  const nice = result?.niceToHaves;
  const skills = result?.skills;
  const eppScans = result?.eppScans;
  const rec = result?.recommendation;

  return (
    <Section title="Screen - resume" defaultOpen={defaultOpen}>
      <div className="text-xs text-gray-500">
        One automated screen for the 200 \u2192 20 gate, run automatically when the candidate reaches Candidate Review \u2014 no manual step. It checks the resume against the job's <strong>required</strong> qualifications, grades <strong>skills fit</strong> and <strong>values match</strong>, and gives one recommendation. Skills and values inform the call but never reject on their own. Scores are provisional \u2014 calibrate before relying on them.
      </div>

      {resumeUrl ? (
        <a href={resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ls-primary font-semibold border border-dashed border-ls-primary rounded-md px-2.5 py-1 text-xs">See resume →</a>
      ) : (
        <div className="text-xs text-gray-400 italic">{hasStoredResume ? 'Resume on file.' : 'No resume on file yet — it attaches automatically when the candidate applies.'}</div>
      )}

      {result && (
        <div className="mt-2 space-y-2">
          {rec === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <div className="text-xs font-semibold text-red-700">Recommend reject{result.movedToStage ? ' \u2014 moved to Rejected' : ''}</div>
              <div className="text-xs text-red-700 mt-0.5">{result.reason}</div>
            </div>
          )}
          {rec === 'advanced' && (
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <div className="text-xs font-semibold text-green-700">
                Recommend advance{result.movedToStage ? ` \u2014 moved to ${result.movedToStage}` : ''} \u00b7 combined {result.composite}/100
              </div>
            </div>
          )}
          {rec === 'review' && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <div className="text-xs font-semibold text-amber-800">Needs human review \u00b7 combined {result.composite}/100</div>
              {result.reason ? <div className="text-xs text-amber-700 mt-0.5">{result.reason}</div> : null}
            </div>
          )}

          <div className="space-y-1.5 border border-gray-100 rounded p-2">
            <ScoreBar label="Requirements" score={req && req.totalCount ? Math.round((req.metCount / req.totalCount) * 100) : null} sub={req ? (req.totalCount ? `${req.metCount}/${req.totalCount} required met` : 'No required qualifications listed') : undefined} />
            <ScoreBar label="Skills fit" score={skills ? skills.score : null} sub={skills && skills.mode === 'keyword' ? 'Keyword fallback \u2014 advisory only' : undefined} />
            <ScoreBar label="Role fit match" score={result.eppMatch ?? null} sub={eppScans?.hasEpp ? `avg across ${eppScans.traitCount} EPP traits` : 'No EPP results on file yet'} />
            <ScoreBar label="Company values match" score={result.companyValuesMatch ?? null} sub={eppScans?.hasEpp ? `across ${eppScans.scoredValues} company values` : 'No EPP results on file yet'} />
          </div>

          {req && req.requirements?.length > 0 && (
            <div className="space-y-1">
              {req.requirements.map((r: any, i: number) => (
                <div key={i} className="text-xs flex gap-1.5">
                  <span className={r.met ? 'text-green-600' : 'text-red-600'}>{r.met ? '\u2713' : '\u2717'}</span>
                  <span className="text-gray-700">
                    <span className="font-medium">{r.requirement}</span>
                    {r.evidence ? <span className="text-gray-400 italic"> \u2014 {r.evidence}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {skills && skills.skills?.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="text-xs font-medium text-gray-800">Skills fit detail</div>
              {skills.skills.map((sk: any, i: number) => (
                <div key={i} className="text-xs flex gap-1.5">
                  <span className={sk.rating >= 65 ? 'text-green-600' : sk.rating >= 40 ? 'text-amber-600' : 'text-red-600'}>{sk.rating}</span>
                  <span className="text-gray-700"><span className="font-medium">{sk.skill}</span>{sk.evidence ? <span className="text-gray-400 italic"> \u2014 {sk.evidence}</span> : null}</span>
                </div>
              ))}
            </div>
          )}

          {nice && nice.totalCount > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <div className="text-xs font-medium text-gray-800 mb-1">Nice-to-haves (note only)</div>
              {nice.missing.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="text-xs text-amber-700">Missing (noted for hiring manager, not a dealbreaker):</div>
                  <ul className="list-disc list-inside">
                    {nice.missing.map((m: string, i: number) => (<li key={i} className="text-xs text-amber-700">{m}</li>))}
                  </ul>
                </div>
              ) : (<div className="text-xs text-green-700">All nice-to-haves met.</div>)}
            </div>
          )}
        </div>
      )}

      {!result && existingSummary && (
        <div className="text-xs text-gray-600 whitespace-pre-wrap mt-1">{existingSummary}</div>
      )}
    </Section>
  );
}

function TimelineAlerts() {
  const q = trpc.candidates.timelineAlerts.useQuery(undefined, { refetchInterval: 60000 });
  const a = q.data;
  if (!a) return null;
  const total = a.stalledCandidates.length + a.overdueReqs.length;
  if (total === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-amber-800">Timeline alerts</span>
        <span className="text-xs text-amber-700">{a.stalledCandidates.length} stalled candidate{a.stalledCandidates.length === 1 ? '' : 's'} · {a.overdueReqs.length} overdue req{a.overdueReqs.length === 1 ? '' : 's'}</span>
      </div>
      {a.stalledCandidates.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-amber-800 mb-1">Sitting too long in stage</div>
          <ul className="space-y-0.5">
            {a.stalledCandidates.map((s: any) => (
              <li key={s.candidateId} className="text-xs text-gray-700">
                <span className="font-medium">{s.name}</span>{s.jobTitle ? ` · ${s.jobTitle}` : ''} · {s.stage} · <span className="text-amber-700 font-semibold">{s.daysInStage}d</span> <span className="text-gray-400">(SLA {s.slaDays}d)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.overdueReqs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-amber-800 mb-1">Requisitions past timeline — reassess JD / sourcing / comp</div>
          <ul className="space-y-0.5">
            {a.overdueReqs.map((r: any) => (
              <li key={r.reqId} className="text-xs text-gray-700">
                <span className="font-medium">{r.department}</span> · {r.hiringManager} · <span className="text-amber-700 font-semibold">{r.daysOpen}d open</span> · {r.reasons.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfferSection({ candidateId, onChanged, defaultOpen }: { candidateId: string; onChanged?: () => void; defaultOpen?: boolean }) {
  const defaults = trpc.candidates.offerDefaults.useQuery({ id: candidateId });
  const [f, setF] = useState({ jobTitle: '', baseSalary: '', variableComp: '', startDate: '', reportsTo: '', department: '', employmentType: 'Full-Time', location: '' });
  const [clauses, setClauses] = useState<string[]>([]);
  const [addendum, setAddendum] = useState<{ title: string; body: string }[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Prefill from the requisition (intake) once it loads.
  useEffect(() => {
    const d = defaults.data;
    if (!d) return;
    setF({
      jobTitle: d.jobTitle ?? '',
      baseSalary: d.suggestedSalary != null ? String(d.suggestedSalary) : '',
      variableComp: (d as any).variableComp ?? '',
      startDate: d.targetStartDate ?? '',
      reportsTo: d.reportsTo ?? '',
      department: d.department ?? '',
      employmentType: d.employmentType ?? 'Full-Time',
      location: d.location ?? '',
    });
    setClauses((d as any).standardClauses ?? []);
  }, [defaults.data]);

  const d = defaults.data;
  const payload = () => ({
    id: candidateId,
    jobTitle: f.jobTitle || undefined,
    baseSalary: f.baseSalary.trim() ? parseInt(f.baseSalary.replace(/[^0-9]/g, '')) : undefined,
    variableComp: f.variableComp || undefined,
    startDate: f.startDate || undefined,
    reportsTo: f.reportsTo || undefined,
    department: f.department || undefined,
    employmentType: f.employmentType || undefined,
    location: f.location || undefined,
    legalClauses: clauses.length ? clauses : undefined,
    addendum: addendum.filter((a) => a.title.trim() || a.body.trim()),
  });

  const preview = trpc.candidates.offerPreview.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(false); } });
  const send = trpc.candidates.sendOffer.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(true); onChanged?.(); } });
  const esign = trpc.candidates.sendOfferViaAdobeSign.useMutation({ onSuccess: () => onChanged?.() });
  const approvalStatus = trpc.candidates.offerApprovalStatus.useQuery({ candidateId });
  const requestApproval = trpc.candidates.requestOfferApproval.useMutation({ onSuccess: () => { approvalStatus.refetch(); onChanged?.(); } });

  const field = (label: string, key: keyof typeof f, placeholder = '') => (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} placeholder={placeholder}
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
    </div>
  );

  const band = d && (d.bandMin != null || d.bandMax != null)
    ? `$${(d.bandMin ?? d.bandMax)?.toLocaleString()} – $${(d.bandMax ?? d.bandMin)?.toLocaleString()}`
    : null;

  return (
    <Section title="Offer Letter (external)" defaultOpen={defaultOpen}>
      <div className="text-xs text-gray-500">
        Prefilled from the approved intake. Prefilled from the approved intake (title, comp, manager, department, location, dates). Every field and the standard legal language below are editable, so you can fix any mistake before it goes for approval. It is sent to the hiring manager first, who signs off before the candidate is contacted. Custom items go on an addendum. Generated from a fixed template — not AI.
      </div>

      {/* Confirm fields (candidate-specific) */}
      <div className="bg-blue-50 border border-blue-100 rounded p-2 space-y-2">
        <div className="text-xs font-semibold text-blue-800">Confirm for this candidate</div>
        <div>
          <div className="text-xs text-gray-600 mb-0.5">
            Base salary (annual){band ? <span className="text-gray-400"> · approved band {band}{d?.financeConfirmed ? ' · finance ✓' : ''}</span> : null}
          </div>
          <input value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: e.target.value })} placeholder="120000"
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
        </div>
        {field('Start date', 'startDate', 'August 4, 2025')}
        {field('Variable compensation (bonus / commission / equity)', 'variableComp', 'e.g. 15% target bonus')}
      </div>

      {/* From intake (prefilled, editable to override) */}
      <div className="pt-1">
        <div className="text-xs font-medium text-gray-500 mb-1">From intake (edit only to override)</div>
        <div className="grid grid-cols-2 gap-2">
          {field('Position', 'jobTitle')}
          {field('Reports to', 'reportsTo')}
          {field('Department', 'department')}
          {field('Employment type', 'employmentType')}
          {field('Location', 'location')}
        </div>
      </div>

      {/* Editable standard legal language (shows red in the preview = needs counsel review). */}
      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-gray-500">Legal language (standard — edit to fix mistakes)</div>
          <button type="button" onClick={() => setClauses((d as any)?.standardClauses ?? [])}
            className="text-xs text-gray-400 hover:text-ls-primary">Reset to standard</button>
        </div>
        {clauses.map((c, i) => (
          <textarea key={i} value={c} rows={2}
            onChange={(e) => setClauses(clauses.map((x, j) => j === i ? e.target.value : x))}
            className="w-full mb-1 px-2 py-1 border border-gray-300 rounded text-xs" />
        ))}
      </div>

      <div className="pt-1">
        <div className="text-xs text-gray-500 mb-1">Addendum items (custom, optional)</div>
        {addendum.map((a, i) => (
          <div key={i} className="mb-1 space-y-1">
            <input value={a.title} placeholder="Addendum title (e.g. Transition plan)"
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <textarea value={a.body} placeholder="Addendum details" rows={2}
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <button onClick={() => setAddendum(addendum.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-600">Remove addendum</button>
          </div>
        ))}
        <button onClick={() => setAddendum([...addendum, { title: '', body: '' }])}
          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">+ Add addendum</button>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => preview.mutate(payload())} disabled={preview.isLoading}
          className="text-xs px-3 py-1.5 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50">
          {preview.isLoading ? 'Rendering...' : 'Preview letter'}
        </button>
        <button onClick={() => requestApproval.mutate(payload())} disabled={requestApproval.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">
          {requestApproval.isLoading ? 'Sending...' : 'Send to hiring manager for approval'}
        </button>
      </div>
      {approvalStatus.data && (
        <div className={`text-xs mt-1 rounded p-2 border ${approvalStatus.data.status === 'approved' ? 'bg-green-50 border-green-200 text-green-800' : approvalStatus.data.status === 'sent_back' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {approvalStatus.data.status === 'pending' && <>Sent for approval{approvalStatus.data.currentApproverName ? ` — awaiting ${approvalStatus.data.currentApproverName}` : (approvalStatus.data.managerName ? ` (${approvalStatus.data.managerName})` : '')}{approvalStatus.data.totalSteps && approvalStatus.data.totalSteps > 1 ? ` · ${approvalStatus.data.approvedCount}/${approvalStatus.data.totalSteps} approvers signed off` : ''}. The candidate has not been contacted yet - it is waiting in the test inbox for review and sign-off.</>}
          {approvalStatus.data.status === 'approved' && <>Approved{approvalStatus.data.managerName ? ` by ${approvalStatus.data.managerName}` : ''} - the offer has been sent to the candidate.</>}
          {approvalStatus.data.status === 'sent_back' && <>Sent back by the hiring manager{approvalStatus.data.managerNote ? `: "${approvalStatus.data.managerNote}"` : ''}. Fix the offer above and send for approval again.</>}
        </div>
      )}

      {html && (
        <div className="mt-2 border border-gray-200 rounded bg-white max-h-96 overflow-y-auto">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </Section>
  );
}

function InternalOfferSection({ candidateId, onChanged, defaultOpen }: { candidateId: string; onChanged?: () => void; defaultOpen?: boolean }) {
  const defaults = trpc.candidates.offerDefaults.useQuery({ id: candidateId });
  // New role (prefilled from intake; editable). Current role (HR-entered).
  const [nw, setNw] = useState({ newTitle: '', newBaseSalary: '', newBonus: '', newManager: '', newDepartment: '', newStipends: '', effectiveDate: '' });
  const [cur, setCur] = useState({ currentTitle: '', currentBaseSalary: '', currentBonus: '', currentManager: '', currentDepartment: '', currentStipends: '' });
  const [addendum, setAddendum] = useState<{ title: string; body: string }[]>([{ title: 'Transition plan', body: '' }]);
  const [html, setHtml] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [clauses, setClauses] = useState<string[]>([]);

  useEffect(() => {
    const d = defaults.data;
    if (!d) return;
    setNw((prev) => ({
      ...prev,
      newTitle: prev.newTitle || (d.jobTitle ?? ''),
      newBaseSalary: prev.newBaseSalary || (d.suggestedSalary != null ? String(d.suggestedSalary) : ''),
      newManager: prev.newManager || (d.reportsTo ?? ''),
      newDepartment: prev.newDepartment || (d.department ?? ''),
    }));
    setClauses((prev) => prev.length ? prev : ((d as any).standardInternalClauses ?? []));
  }, [defaults.data]);

  const d = defaults.data;
  const num = (v: string) => (v.trim() ? parseInt(v.replace(/[^0-9]/g, '')) : undefined);
  const payload = () => ({
    id: candidateId,
    effectiveDate: nw.effectiveDate || undefined,
    newTitle: nw.newTitle || undefined,
    newBaseSalary: num(nw.newBaseSalary),
    newBonus: nw.newBonus || undefined,
    newManager: nw.newManager || undefined,
    newDepartment: nw.newDepartment || undefined,
    newStipends: nw.newStipends || undefined,
    currentTitle: cur.currentTitle || undefined,
    currentBaseSalary: num(cur.currentBaseSalary),
    currentBonus: cur.currentBonus || undefined,
    currentManager: cur.currentManager || undefined,
    currentDepartment: cur.currentDepartment || undefined,
    currentStipends: cur.currentStipends || undefined,
    legalClauses: clauses.length ? clauses : undefined,
    addendum: addendum.filter((a) => a.title.trim() || a.body.trim()),
  });

  const preview = trpc.candidates.internalOfferPreview.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(false); } });
  const send = trpc.candidates.sendInternalOffer.useMutation({ onSuccess: (r) => { setHtml(r.html); setSent(true); onChanged?.(); } });
  const esign = trpc.candidates.sendInternalOfferViaAdobeSign.useMutation({ onSuccess: () => onChanged?.() });
  const approvalStatus = trpc.candidates.offerApprovalStatus.useQuery({ candidateId });
  const requestApproval = trpc.candidates.requestInternalOfferApproval.useMutation({ onSuccess: () => { approvalStatus.refetch(); onChanged?.(); } });
  const draftPlan = trpc.candidates.draftTransitionPlan.useMutation({
    onSuccess: (r) => {
      setAddendum((prev) => {
        const idx = prev.findIndex((a) => /transition/i.test(a.title));
        if (idx >= 0) {
          return prev.map((a, j) => (j === idx ? { ...a, body: r.text } : a));
        }
        return [...prev, { title: 'Transition plan', body: r.text }];
      });
    },
  });
  const draftPayload = () => ({
    id: candidateId,
    effectiveDate: nw.effectiveDate || undefined,
    newTitle: nw.newTitle || undefined,
    newManager: nw.newManager || undefined,
    newDepartment: nw.newDepartment || undefined,
    currentTitle: cur.currentTitle || undefined,
    currentManager: cur.currentManager || undefined,
    currentDepartment: cur.currentDepartment || undefined,
  });

  const band = d && (d.bandMin != null || d.bandMax != null)
    ? `$${(d.bandMin ?? d.bandMax)?.toLocaleString()} \u2013 $${(d.bandMax ?? d.bandMin)?.toLocaleString()}`
    : null;

  const twoCol = (label: string, curKey: keyof typeof cur, nwKey: keyof typeof nw, ph = '') => (
    <div className="grid grid-cols-[110px_1fr_1fr] gap-2 items-center">
      <div className="text-xs text-gray-500">{label}</div>
      <input value={cur[curKey]} onChange={(e) => setCur({ ...cur, [curKey]: e.target.value })} placeholder="current"
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
      <input value={nw[nwKey]} onChange={(e) => setNw({ ...nw, [nwKey]: e.target.value })} placeholder={ph || 'new'}
        className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
    </div>
  );

  return (
    <Section title="Offer Letter (internal move)" defaultOpen={defaultOpen}>
      <div className="text-xs text-gray-500">
        Internal move. The letter shows a <strong>before / now</strong> comparison so the employee sees exactly what changes. The <strong>new role</strong> column is prefilled from the approved intake; the <strong>current</strong> column is entered by HR (HRIS integration pending). Every field and the legal language are editable. Put the transition plan on the addendum. It is sent to the hiring manager for sign-off before the employee is contacted. Generated from a fixed template — not AI.
      </div>

      <div className="grid grid-cols-[110px_1fr_1fr] gap-2 pt-1">
        <div></div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current (before)</div>
        <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">New role (now)</div>
      </div>
      <div className="space-y-1.5">
        {twoCol('Title', 'currentTitle', 'newTitle')}
        {twoCol('Base salary', 'currentBaseSalary', 'newBaseSalary', band ? `band ${band}` : '120000')}
        {twoCol('Bonus ($ or %)', 'currentBonus', 'newBonus', 'e.g. 10% or $15,000')}
        {twoCol('Manager', 'currentManager', 'newManager')}
        {twoCol('Department', 'currentDepartment', 'newDepartment')}
        {twoCol('Stipends', 'currentStipends', 'newStipends')}
      </div>

      <div className="pt-2">
        <div className="text-xs text-gray-500 mb-0.5">Effective date</div>
        <input value={nw.effectiveDate} onChange={(e) => setNw({ ...nw, effectiveDate: e.target.value })} placeholder="August 4, 2025"
          className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
      </div>

      <div className="pt-1">
        <div className="text-xs text-gray-500 mb-1">Addendum items (transition plan, etc.)</div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => draftPlan.mutate(draftPayload())} disabled={draftPlan.isLoading}
            className="text-xs px-2 py-1 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50">
            {draftPlan.isLoading ? 'Drafting\u2026' : '\u2728 Draft transition plan with AI'}
          </button>
          {draftPlan.data && (
            <span className="text-xs text-gray-400">
              {draftPlan.data.mode === 'ai' ? 'AI draft \u2014 review & edit.' : 'Draft (no AI key) \u2014 review & edit.'}
            </span>
          )}
        </div>
        {addendum.map((a, i) => (
          <div key={i} className="mb-1 space-y-1">
            <input value={a.title} placeholder="Addendum title (e.g. Transition plan)"
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <textarea value={a.body} placeholder="Addendum details" rows={2}
              onChange={(e) => setAddendum(addendum.map((x, j) => j === i ? { ...x, body: e.target.value } : x))}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
            <button onClick={() => setAddendum(addendum.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-600">Remove addendum</button>
          </div>
        ))}
        <button onClick={() => setAddendum([...addendum, { title: '', body: '' }])}
          className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">+ Add addendum</button>
      </div>

      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-gray-500">Legal language (standard - edit to fix mistakes)</div>
          <button type="button" onClick={() => setClauses((d as any)?.standardInternalClauses ?? [])}
            className="text-xs text-gray-400 hover:text-ls-primary">Reset to standard</button>
        </div>
        {clauses.map((c, i) => (
          <textarea key={i} value={c} rows={2}
            onChange={(e) => setClauses(clauses.map((x, j) => j === i ? e.target.value : x))}
            className="w-full mb-1 px-2 py-1 border border-gray-300 rounded text-xs" />
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => preview.mutate(payload())} disabled={preview.isLoading}
          className="text-xs px-3 py-1.5 border border-ls-primary text-ls-primary rounded font-medium disabled:opacity-50">
          {preview.isLoading ? 'Rendering...' : 'Preview letter'}
        </button>
        <button onClick={() => requestApproval.mutate(payload())} disabled={requestApproval.isLoading}
          className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50">
          {requestApproval.isLoading ? 'Sending...' : 'Send to hiring manager for approval'}
        </button>
      </div>
      {approvalStatus.data && (
        <div className={`text-xs mt-1 rounded p-2 border ${approvalStatus.data.status === 'approved' ? 'bg-green-50 border-green-200 text-green-800' : approvalStatus.data.status === 'sent_back' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {approvalStatus.data.status === 'pending' && <>Sent for approval{approvalStatus.data.currentApproverName ? ` — awaiting ${approvalStatus.data.currentApproverName}` : (approvalStatus.data.managerName ? ` (${approvalStatus.data.managerName})` : '')}{approvalStatus.data.totalSteps && approvalStatus.data.totalSteps > 1 ? ` · ${approvalStatus.data.approvedCount}/${approvalStatus.data.totalSteps} approvers signed off` : ''}. The employee has not been contacted yet - it is waiting in the test inbox for review and sign-off.</>}
          {approvalStatus.data.status === 'approved' && <>Approved{approvalStatus.data.managerName ? ` by ${approvalStatus.data.managerName}` : ''} - the internal offer has been sent.</>}
          {approvalStatus.data.status === 'sent_back' && <>Sent back by the hiring manager{approvalStatus.data.managerNote ? `: "${approvalStatus.data.managerNote}"` : ''}. Fix the offer above and send for approval again.</>}
        </div>
      )}

      {html && (
        <div className="mt-2 border border-gray-200 rounded bg-white max-h-96 overflow-y-auto">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </Section>
  );
}

// Reach-out + log control for an interview round where the candidate proposed
// times that didn't line up (mirrors the phone-screen reach-out panel). Shown in
// the candidate-detail rounds summary so a stuck round can be resolved here too.
function InterviewRoundReachOut({ round, candidate, onChanged }: { round: any; candidate: any; onChanged?: () => void }) {
  const [when, setWhen] = useState('');
  const log = trpc.interviews.updateRound.useMutation({ onSuccess: () => onChanged?.() });
  const proposed: any[] = Array.isArray(round.candidateProposedSlots) ? round.candidateProposedSlots : [];
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
      <div className="text-xs font-semibold text-amber-800">Reach out to schedule this round</div>
      <p className="text-[11px] text-amber-700 mt-0.5">The candidate proposed times that didn't line up. Reach out from your own inbox to agree on a time, then log it here. They stay flagged for action until you do. The app sends them nothing.</p>
      <div className="text-[11px] text-amber-800 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {candidate.email && <span><span className="text-amber-600">Email:</span> {candidate.email}</span>}
        {candidate.phone && <span><span className="text-amber-600">Phone:</span> {candidate.phone}</span>}
      </div>
      {proposed.length > 0 && (
        <div className="text-[11px] text-amber-700 mt-1">
          <span className="font-medium">Times the candidate suggested:</span>
          <ul className="list-disc ml-4">{proposed.map((s: any, i: number) => <li key={i}>{typeof s === 'string' ? s : s.label}</li>)}</ul>
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
          className="px-2 py-1 border border-amber-300 rounded text-[11px] focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
        <button onClick={() => when && log.mutate({ id: round.id, scheduledAt: new Date(when).toISOString(), status: 'scheduled' })}
          disabled={!when || log.isLoading}
          className="text-[11px] px-3 py-1 rounded bg-ls-primary text-white font-semibold hover:bg-ls-primary-600 disabled:opacity-50">
          {log.isLoading ? 'Saving…' : 'Log the agreed time'}
        </button>
      </div>
      {log.error && <p className="text-[11px] text-red-600 mt-1">{log.error.message}</p>}
    </div>
  );
}

export function PhoneScreenSchedulingSection({ candidate, onChanged: _onChanged, defaultOpen }: { candidate: any; onChanged?: () => void; defaultOpen?: boolean }) {
  const status = trpc.scheduling.phoneScreenStatusFor.useQuery({ candidateId: candidate.id });
  const s = status.data;
  const scheduled = s?.scheduledAt ? new Date(s.scheduledAt) : null;
  const logMut = trpc.scheduling.logPhoneScreenScheduled.useMutation({ onSuccess: () => status.refetch() });
  const [ld, setLd] = useState('');
  const [ls, setLs] = useState('');
  const [le, setLe] = useState('');
  return (
    <Section title="Screening call" defaultOpen={defaultOpen}>
      {scheduled ? (
        <div className="text-sm text-green-700 font-medium">Call confirmed{s?.selectedSlot ? ` — ${s.selectedSlot}` : `: ${scheduled.toLocaleString()}`}</div>
      ) : (
        <>
          {s?.needsOutreach && (
            <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="text-sm font-semibold text-amber-800">Reach out to set a time</div>
              <p className="text-xs text-amber-700 mt-0.5">
                {s?.candidateFirstName ?? 'The candidate'} couldn’t make your proposed times, so there’s no common availability. Contact them directly to agree on a time, then log it below. They stay flagged for action until you do.
              </p>
              <div className="text-xs text-amber-800 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {s?.candidateEmail && <span><span className="text-amber-600">Email:</span> <a className="underline" href={`mailto:${s.candidateEmail}`}>{s.candidateEmail}</a></span>}
                {s?.candidatePhone && <span><span className="text-amber-600">Phone:</span> {s.candidatePhone}</span>}
              </div>
              {(s?.candidateSlots?.length ?? 0) > 0 && (
                <div className="text-xs text-amber-700 mt-2">
                  <div className="font-medium">Times the candidate said work for them:</div>
                  <ul className="list-disc ml-4 mt-0.5">{(s?.candidateSlots ?? []).map((sl: string, i: number) => <li key={i}>{sl}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {s?.opened ? (
            <div className="text-sm text-gray-600 space-y-1">
              <div>Your availability was sent to the candidate. Waiting on them to confirm a time (or tell us none work).</div>
              {s?.availability && <div className="text-xs text-gray-500 whitespace-pre-wrap border border-gray-100 rounded p-2">{s.availability}</div>}
              {s?.bookingUrl && <div className="text-xs">Candidate link: <a className="text-ls-primary underline" href={s.bookingUrl}>confirmation page</a></div>}
              {s?.recruiterUrl && <div className="text-xs">Update your availability: <a className="text-ls-primary underline" href={s.recruiterUrl}>availability page</a></div>}
            </div>
          ) : s?.recruiterUrl ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Recruiter-first scheduling: enter your availability, then the candidate is emailed those windows to confirm.
                The candidate is not contacted until you submit. A link was also emailed to the recruiter inbox.
              </p>
              <a href={s.recruiterUrl} className="inline-block px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600">
                Set your availability
              </a>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Scheduling starts automatically when the candidate reaches Phone Screen. If you don't see a link yet, refresh in a moment.
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-600 mb-2">Scheduled it directly? Log the confirmed time</div>
            <div className="flex items-center gap-2">
              <input type="date" value={ld} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setLd(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              <input type="time" value={ls} onChange={(e) => setLs(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="time" value={le} onChange={(e) => setLe(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">End time optional. Records the call as scheduled and clears the “needs action” flag.</p>
            {logMut.error && <p className="text-xs text-red-600 mt-1">{logMut.error.message}</p>}
            <button onClick={() => logMut.mutate({ candidateId: candidate.id, date: ld, start: ls, end: le || undefined })}
              disabled={!ld || !ls || logMut.isLoading}
              className="mt-2 px-4 py-2 rounded-md border border-ls-primary text-ls-primary text-sm font-semibold hover:bg-ls-primary/5 disabled:opacity-50">
              {logMut.isLoading ? 'Saving…' : 'Log confirmed time'}
            </button>
          </div>
        </>
      )}
    </Section>
  );
}

// Recruiter-first scheduling for a LIVE WALKTHROUGH work sample: offer >=3
// date/time windows; the candidate is emailed those windows and picks one. No
// Calendly. Renders nothing for take-home work samples (isWalkthrough === false).
export function WalkthroughSchedulingSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const status = trpc.scheduling.walkthroughStatusFor.useQuery({ candidateId: candidate.id });
  const s = status.data;
  const submit = trpc.scheduling.submitWalkthroughAvailability.useMutation({ onSuccess: () => { status.refetch(); onChanged?.(); } });
  const [rows, setRows] = useState<{ date: string; start: string; end: string }[]>([
    { date: '', start: '', end: '' }, { date: '', start: '', end: '' }, { date: '', start: '', end: '' },
  ]);
  const [note, setNote] = useState('');
  if (!s || !s.isWalkthrough) return null;
  const scheduled = s.scheduledAt ? new Date(s.scheduledAt) : null;
  const valid = rows.filter((r) => r.date && r.start && r.end);
  const setRow = (i: number, patch: Partial<{ date: string; start: string; end: string }>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const today = new Date().toISOString().slice(0, 10);
  const blank3 = () => setRows([{ date: '', start: '', end: '' }, { date: '', start: '', end: '' }, { date: '', start: '', end: '' }]);
  return (
    <Section title="Work sample walkthrough" defaultOpen>
      {scheduled ? (
        <div className="text-sm text-green-700 font-medium">Walkthrough confirmed{s.selectedSlot ? ` — ${s.selectedSlot}` : `: ${scheduled.toLocaleString()}`}</div>
      ) : s.opened ? (
        <div className="text-sm text-gray-600 space-y-1">
          <div>Your availability was sent to the candidate. Waiting on them to pick a time.</div>
          {s.availability && <div className="text-xs text-gray-500 whitespace-pre-wrap border border-gray-100 rounded p-2">{s.availability}</div>}
          {s.bookingUrl && <div className="text-xs">Candidate link: <a className="text-ls-primary underline" href={s.bookingUrl}>booking page</a></div>}
          <button onClick={blank3} className="text-xs text-ls-primary font-medium">Offer new times</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Offer at least 3 time windows. The candidate is emailed those windows and picks one to confirm the live walkthrough. No external calendar needed.</p>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" value={r.date} min={today} onChange={(e) => setRow(i, { date: e.target.value })} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              <input type="time" value={r.start} onChange={(e) => setRow(i, { start: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="time" value={r.end} onChange={(e) => setRow(i, { end: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
              {rows.length > 3 && <button onClick={() => setRows(rows.filter((_, k) => k !== i))} className="text-gray-400 hover:text-red-500 text-sm" title="Remove">✕</button>}
            </div>
          ))}
          <button onClick={() => setRows([...rows, { date: '', start: '', end: '' }])} className="text-xs text-ls-primary font-medium">+ Add another time</button>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note to the candidate" className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
          {submit.error && <p className="text-xs text-red-600">{submit.error.message}</p>}
          <button
            onClick={() => submit.mutate({ candidateId: candidate.id, windows: valid, note: note || undefined })}
            disabled={valid.length < 3 || submit.isLoading}
            className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50">
            {submit.isLoading ? 'Sending…' : valid.length < 3 ? `Send availability (need ${3 - valid.length} more)` : 'Send availability'}
          </button>
        </div>
      )}
    </Section>
  );
}

export function SchedulingSection({ candidate, onChanged }: { candidate: any; onChanged?: () => void }) {
  const status = trpc.scheduling.statusFor.useQuery({ candidateId: candidate.id });
  const open = trpc.scheduling.open.useMutation({ onSuccess: () => { status.refetch(); onChanged?.(); } });
  const [calendlyUrl, setCalendlyUrl] = useState('');

  const s = status.data;
  const scheduled = s?.scheduledAt ? new Date(s.scheduledAt) : null;

  return (
    <Section title="Interview Scheduling">
      {scheduled ? (
        <div className="text-sm text-gray-700 space-y-1">
          <div className="font-medium text-green-700">Booked for {scheduled.toLocaleString()}</div>
          {s?.joinUrl && <div className="text-xs">Meeting: <a href={s.joinUrl} className="text-ls-primary underline">join link</a></div>}
          {s?.cancelUrl && <div className="text-xs">Candidate can <a href={s.cancelUrl} className="text-ls-primary underline">reschedule/cancel</a> (Calendly).</div>}
        </div>
      ) : s?.opened ? (
        <div className="text-sm text-gray-600 space-y-1">
          <div>Booking link sent to the candidate. Waiting on them to pick a time in Calendly.</div>
          {s?.bookingUrl && <div className="text-xs">Candidate link: <a className="text-ls-primary underline" href={s.bookingUrl}>booking page</a></div>}
          {s?.schedulingUrl && <div className="text-xs text-gray-400">Calendly: {s.schedulingUrl}</div>}
          {!s?.calendlyConfigured && <div className="text-xs text-amber-600">Calendly webhook key not set — bookings won't record until it's configured on the server.</div>}
          <button onClick={() => open.mutate({ candidateId: candidate.id })} disabled={open.isLoading} className="mt-1 text-xs text-ls-primary font-medium">Re-send booking link</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Emails the candidate a link to book through Calendly. Leave the field blank to use the org default scheduling link, or paste this interviewer's Calendly event URL.
          </p>
          <input
            type="url"
            value={calendlyUrl}
            onChange={(e) => setCalendlyUrl(e.target.value)}
            placeholder="https://calendly.com/… (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          />
          <button
            onClick={() => open.mutate({ candidateId: candidate.id, calendlyUrl: calendlyUrl || undefined })}
            disabled={open.isLoading}
            className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {open.isLoading ? 'Opening…' : 'Open scheduling'}
          </button>
        </div>
      )}
      {open.error && <p className="text-sm text-red-600">{open.error.message}</p>}
    </Section>
  );
}

export function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="mb-4 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2"
      >
        {title}
        <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

export function EditableField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      {editing ? (
        <div className="flex gap-1">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ls-cyan"
          />
          <button onClick={() => { onSave(val); setEditing(false); }} className="text-xs px-2 py-1 bg-ls-primary text-white rounded">Save</button>
          <button onClick={() => { setVal(value); setEditing(false); }} className="text-xs px-2 py-1 text-gray-500">✕</button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-xs text-gray-800 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 min-h-[20px]"
        >
          {value || <span className="text-gray-300 italic">Click to edit</span>}
        </div>
      )}
    </div>
  );
}

function EditableTextarea({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      {editing ? (
        <div>
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            rows={3}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ls-cyan"
          />
          <div className="flex gap-1 mt-1">
            <button onClick={() => { onSave(val); setEditing(false); }} className="text-xs px-2 py-1 bg-ls-primary text-white rounded">Save</button>
            <button onClick={() => { setVal(value); setEditing(false); }} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-xs text-gray-800 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 min-h-[20px] whitespace-pre-wrap"
        >
          {value || <span className="text-gray-300 italic">Click to edit</span>}
        </div>
      )}
    </div>
  );
}
