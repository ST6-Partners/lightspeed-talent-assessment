// ============================================================
// HELP — in-app user guide for AI Talent Assessment.
// Self-contained (no data fetching): a robust, always-available
// reference explaining the hiring pipeline, every working area,
// what the AI does, the automated email/link flows, and roles.
// Reached via the header "?" icon (see Layout) at /help.
// Styling: main-app Tailwind ls-* tokens (not the admin RCDO inline
// pattern) so it matches the rest of the pipeline UI.
// ============================================================

import { useState } from 'react';
import {
  LifeBuoy, Workflow, ClipboardPen, ClipboardList, Megaphone, Users,
  ClipboardCheck, UserCheck, Brain, Library, CheckSquare, Video,
  BarChart2, ShieldCheck, Database, Sparkles, Mail, KeyRound, Lightbulb,
  Bell, Bot, MessageSquare, Settings, Search, ArrowRight,
} from 'lucide-react';

// ── Pipeline stages (source of truth: server STAGES enum) ───
const STAGES: { name: string; blurb: string }[] = [
  { name: 'Applied', blurb: 'Candidate applies to an open role, or is added manually.' },
  { name: 'Assessment', blurb: 'Automated gate scores personality (EPP), cognitive aptitude (CCAT) and company-values fit.' },
  { name: 'Values Review', blurb: 'The values screening result is reviewed against the role bar.' },
  { name: 'Phone Screen', blurb: 'A short first conversation to confirm fit and interest.' },
  { name: 'Interview Scheduled', blurb: 'Rounds are booked; the candidate can self-schedule via a Calendly link.' },
  { name: 'Interviewed', blurb: 'Rounds happen; interviewers get AI-tailored questions and briefings.' },
  { name: 'Work Sample', blurb: 'Candidate completes a role-relevant task sent by tokenized link.' },
  { name: 'Reference Check', blurb: 'References are gathered once interviews clear.' },
  { name: 'Offered', blurb: 'An offer is drafted and routed to the hiring manager to review and sign off.' },
  { name: 'Hired', blurb: 'Offer accepted — the candidate joins Lightspeed.' },
];

// ── Working areas, grouped as they appear in the sidebar ────
const TALENT: { icon: any; label: string; body: string }[] = [
  { icon: ClipboardPen, label: 'Intake', body: 'The hiring manager describes who they are looking for. Guided intake asks a few quick questions and fills in the rest for you. This is where a new role begins.' },
  { icon: ClipboardList, label: 'Requisitions', body: 'The formal request to open a role (including details like remote eligibility). Requisitions are routed for approval before a role goes live.' },
  { icon: Megaphone, label: 'Open Roles', body: 'Roles that are published and accepting applications. Each posting shows who has applied so far.' },
  { icon: Users, label: 'Candidates', body: 'The heart of the system. Every candidate record pulls together their resume review, EPP personality profile, CCAT score, company-values result, current stage, and the automated feedback captured from interview transcripts.' },
  { icon: ClipboardCheck, label: 'Review', body: 'The triage queue. Candidates are ranked per role with an AI recommendation so you can quickly decide who advances and who is passed.' },
  { icon: UserCheck, label: 'Internal Pipeline', body: 'Internal applicants and internal moves, tracked separately from external candidates.' },
  { icon: Brain, label: 'Assessments', body: 'The results of the automated assessment gate — personality, cognitive aptitude and values fit — used to concentrate human attention on the strongest applicants.' },
  { icon: Library, label: 'Work Sample', body: 'A library of role-relevant task assignments organized by department, difficulty and time limit. Work samples attached to a job description show up here.' },
  { icon: CheckSquare, label: 'Scorecards', body: 'The human, in-person scorecard. A named reviewer scores the candidate on each company value (1–5), seeded from their EPP and adjusted with interview judgment. Multiple reviewers can each save their own dated pass.' },
  { icon: Video, label: 'Interviews', body: 'A per-round workspace. Each round has its interviewer, schedule, prep and briefing, and transcript-to-feedback all in one card, plus candidate self-scheduling and auto-generated questions.' },
];

const OVERSIGHT: { icon: any; label: string; body: string; admin?: boolean }[] = [
  { icon: BarChart2, label: 'Metrics', body: 'Pipeline analytics: a stage-by-stage conversion funnel, application volume, average days per stage, sources, rejection reasons and assessment quality. Overview, Weekly and Quarterly tabs — the period tabs can also email scheduled reports.' },
  { icon: ShieldCheck, label: 'Bias', admin: true, body: 'An adverse-impact monitor. Shows an aggregate four-fifths (80%) view of the automated assessment gate per role. It never shows candidate-level demographics — aggregate only. Admin access.' },
];

const CORE: { label: string; body: string }[] = [
  { label: 'Employees', body: 'The people directory behind internal moves, org data and reviews.' },
  { label: 'Departments', body: 'Company functions used to route roles, tasks and approvals.' },
  { label: 'Titles', body: 'Standard job titles and levels used across requisitions.' },
  { label: 'Company Values', body: 'The values candidates are scored against during assessment.' },
  { label: 'Job Descriptions', body: 'The library of role descriptions that feed intake and postings.' },
];

const AI_FEATURES: { title: string; body: string }[] = [
  { title: 'AI-authored job descriptions', body: 'Drafts a JD (summary, responsibilities, qualifications, work sample, EPP targets) for the hiring manager to review and sign off.' },
  { title: 'Automated assessment gate', body: 'Scores each applicant on the EPP (12 Criteria Corp personality traits as percentiles), the CCAT cognitive test, a company-values screen, and a resume review.' },
  { title: 'Ranked recommendations', body: 'Turns those signals into a ranked shortlist with a recommendation in the Review queue.' },
  { title: 'Tailored interview questions & briefings', body: 'Generates questions and an interviewer briefing tuned to each candidate. The tailored portion is curated and emailed to the interviewer ahead of the round.' },
  { title: 'Transcript feedback', body: 'Turns interview (e.g. Zoom) transcripts into structured feedback on the candidate record.' },
  { title: 'AI Assistant', body: 'A chat assistant available from the header (the robot icon) that is aware of the screen you are on.' },
];

const FLOWS: { title: string; body: string }[] = [
  { title: 'Intake sent back for edits', body: 'The submitter gets a link to a self-service page showing the reviewer note, edits the intake in place, then saves or re-submits.' },
  { title: 'New JD to review & sign off', body: 'The hiring manager gets a link to review the AI-authored job description and approve it.' },
  { title: 'Requisition approval', body: 'Approvers receive a link to approve (or send back) a requisition before the role opens.' },
  { title: 'Offer to review & sign off', body: 'The hiring manager reviews and signs off an offer — external offers and internal moves both flow through this page.' },
  { title: 'Work sample', body: 'The candidate receives a tokenized link to complete their work-sample task.' },
  { title: 'Interview self-scheduling', body: 'The candidate books an interview slot themselves via a Calendly link.' },
  { title: 'EEO survey', body: 'An optional, anonymous demographic survey used only for aggregate fairness reporting — never tied to individual decisions.' },
];

const ROLES: { role: string; can: string }[] = [
  { role: 'User', can: 'Works the pipeline: intake, candidates, review, interviews and scorecards.' },
  { role: 'Manager', can: 'Everything a user can do, plus manager sign-offs on JDs, requisitions and offers.' },
  { role: 'Admin', can: 'Adds the Bias monitor, Settings, and administrative panels.' },
  { role: 'Sysadmin', can: 'Full access, including user management and system configuration.' },
];

const TIPS: string[] = [
  'Start every new role from Intake — guided intake fills most fields for you.',
  'The Candidates page is the fastest way to see everything known about one person in a single view.',
  'Use the Review queue to make advance/pass decisions quickly from the ranked list.',
  'Interviewers should open the round card in Interviews for their briefing and tailored questions.',
  'The robot icon in the header opens the AI Assistant for the screen you are on.',
  'Found something off? Use the feedback icon (speech bubble) in the header to send a note.',
];

// ── Small building blocks ───────────────────────────────────
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ls-surface border border-ls-line rounded-xl p-5 sm:p-6">{children}</div>
  );
}

function SectionHeading({ id, icon: Icon, title, sub }: { id: string; icon: any; title: string; sub?: string }) {
  return (
    <div id={id} className="scroll-mt-6 flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg ls-accent-grad text-white flex items-center justify-center shrink-0">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ls-ink leading-tight">{title}</h2>
        {sub && <p className="text-[13px] text-ls-ink-3 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const TOC: { id: string; label: string }[] = [
  { id: 'overview', label: 'How it works' },
  { id: 'pipeline', label: 'The hiring pipeline' },
  { id: 'talent', label: 'Talent Acquisition' },
  { id: 'oversight', label: 'Metrics & Bias' },
  { id: 'coredata', label: 'Core Data' },
  { id: 'ai', label: 'What the AI does' },
  { id: 'flows', label: 'Automated emails & links' },
  { id: 'roles', label: 'Roles & access' },
  { id: 'tools', label: 'Header tools' },
  { id: 'tips', label: 'Tips' },
];

export default function Help() {
  const [q, setQ] = useState('');

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Hero */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: 'linear-gradient(120deg,#0B1D40 0%,#123056 55%,#2E89B8 130%)' }}>
        <div className="px-6 sm:px-8 py-7 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <LifeBuoy size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Help &amp; User Guide</h1>
          </div>
          <p className="text-[14px] text-white/85 max-w-2xl leading-relaxed">
            AI Talent Assessment is Lightspeed&apos;s hiring workspace. It automates the
            top of the funnel — assessment, ranking, scheduling and drafting — so your
            team can concentrate its judgment on the strongest finalists. This guide
            explains how the system fits together and what each area is for.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-6">
        {/* Table of contents */}
        <nav className="hidden lg:block sticky top-0 self-start">
          <div className="text-[11px] font-bold uppercase tracking-[.12em] text-ls-ink-3 mb-2 px-2">On this page</div>
          {TOC.map((t) => (
            <button
              key={t.id}
              onClick={() => scrollTo(t.id)}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[13px] text-ls-ink-2 hover:bg-ls-bg-2 hover:text-ls-ink transition-colors"
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="space-y-6 min-w-0">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ls-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter this guide…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-ls-line bg-ls-surface text-sm text-ls-ink placeholder:text-ls-ink-3 focus:outline-none focus:ring-2 focus:ring-ls-primary/30 focus:border-ls-primary"
            />
          </div>

          {/* Overview */}
          {(match('how it works overview funnel judgment finalists automate')) && (
            <SectionCard>
              <SectionHeading id="overview" icon={Workflow} title="How the system works" sub="The idea behind the funnel" />
              <p className="text-[14px] text-ls-ink-2 leading-relaxed">
                Hiring is a funnel. AI Talent Assessment handles the repetitive top of that
                funnel automatically — screening applicants, scoring them, ranking them, drafting
                job descriptions and offers, generating interview questions, and coordinating
                scheduling. That frees your team to spend its time on the decisions that need a
                human: which finalists to advance and who to hire.
              </p>
              <p className="text-[14px] text-ls-ink-2 leading-relaxed mt-3">
                Everything is organized around two things: the <strong>candidate</strong> as they
                move through the pipeline, and the <strong>role</strong> they are being considered
                for. The sidebar groups your work into <strong>Talent Acquisition</strong> (the
                day-to-day pipeline), oversight views (<strong>Metrics</strong> and <strong>Bias</strong>),
                and <strong>Core Data</strong> (the reference information everything else draws on).
              </p>
            </SectionCard>
          )}

          {/* Pipeline */}
          {match('pipeline stages applied assessment values phone screen interview work sample reference offered hired') && (
            <SectionCard>
              <SectionHeading id="pipeline" icon={ArrowRight} title="The hiring pipeline" sub="Every candidate moves through these ten stages" />
              <ol className="space-y-2.5">
                {STAGES.map((s, i) => (
                  <li key={s.name} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-ls-primary-50 text-ls-primary text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <span className="text-[14px] font-semibold text-ls-ink">{s.name}</span>
                      <span className="text-[13.5px] text-ls-ink-2"> — {s.blurb}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {/* Talent Acquisition */}
          {match('talent acquisition intake requisitions open roles candidates review internal pipeline assessments work sample scorecards interviews') && (
            <SectionCard>
              <SectionHeading id="talent" icon={Users} title="Talent Acquisition" sub="Your day-to-day pipeline areas" />
              <div className="grid sm:grid-cols-2 gap-3">
                {TALENT.filter((a) => match(a.label + ' ' + a.body)).map((a) => {
                  const Icon = a.icon;
                  return (
                    <div key={a.label} className="border border-ls-line rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon size={16} className="text-ls-primary" />
                        <h3 className="text-[14px] font-semibold text-ls-ink">{a.label}</h3>
                      </div>
                      <p className="text-[13px] text-ls-ink-2 leading-relaxed">{a.body}</p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Oversight */}
          {match('metrics bias fairness analytics funnel adverse impact four fifths') && (
            <SectionCard>
              <SectionHeading id="oversight" icon={BarChart2} title="Metrics & Bias" sub="Oversight of the whole funnel" />
              <div className="space-y-3">
                {OVERSIGHT.filter((a) => match(a.label + ' ' + a.body)).map((a) => {
                  const Icon = a.icon;
                  return (
                    <div key={a.label} className="border border-ls-line rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon size={16} className="text-ls-primary" />
                        <h3 className="text-[14px] font-semibold text-ls-ink">{a.label}</h3>
                        {a.admin && <span className="text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-ls-bg-2 text-ls-ink-3">Admin</span>}
                      </div>
                      <p className="text-[13px] text-ls-ink-2 leading-relaxed">{a.body}</p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Core Data */}
          {match('core data employees departments titles company values job descriptions reference') && (
            <SectionCard>
              <SectionHeading id="coredata" icon={Database} title="Core Data" sub="The reference data everything draws on" />
              <div className="grid sm:grid-cols-2 gap-3">
                {CORE.filter((c) => match(c.label + ' ' + c.body)).map((c) => (
                  <div key={c.label} className="border border-ls-line rounded-lg p-4">
                    <h3 className="text-[14px] font-semibold text-ls-ink mb-1">{c.label}</h3>
                    <p className="text-[13px] text-ls-ink-2 leading-relaxed">{c.body}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] text-ls-ink-3 mt-3">Reached from the single <strong>Core Data</strong> link in the sidebar, which opens a page of cards.</p>
            </SectionCard>
          )}

          {/* AI */}
          {match('ai claude assistant assessment epp ccat questions briefing transcript recommendation') && (
            <SectionCard>
              <SectionHeading id="ai" icon={Sparkles} title="What the AI does for you" sub="Where automation carries the load" />
              <div className="space-y-2.5">
                {AI_FEATURES.filter((f) => match(f.title + ' ' + f.body)).map((f) => (
                  <div key={f.title} className="flex items-start gap-3">
                    <Sparkles size={15} className="text-ls-cyan shrink-0 mt-1" />
                    <p className="text-[13.5px] text-ls-ink-2 leading-relaxed"><strong className="text-ls-ink">{f.title}.</strong> {f.body}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Flows */}
          {match('automated emails links tokenized jd review intake edit approve offer work sample calendly eeo survey') && (
            <SectionCard>
              <SectionHeading id="flows" icon={Mail} title="Automated emails & links" sub="How people outside the app take action" />
              <p className="text-[13.5px] text-ls-ink-2 leading-relaxed mb-3">
                Several steps reach people by email with a secure, single-purpose link — no login
                required. Each one opens a focused page for exactly that task:
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {FLOWS.filter((f) => match(f.title + ' ' + f.body)).map((f) => (
                  <div key={f.title} className="border border-ls-line rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <KeyRound size={14} className="text-ls-primary" />
                      <h3 className="text-[13.5px] font-semibold text-ls-ink">{f.title}</h3>
                    </div>
                    <p className="text-[13px] text-ls-ink-2 leading-relaxed">{f.body}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Roles */}
          {match('roles access permissions user manager admin sysadmin') && (
            <SectionCard>
              <SectionHeading id="roles" icon={ShieldCheck} title="Roles & access" sub="What each role can see and do" />
              <div className="divide-y divide-ls-line">
                {ROLES.filter((r) => match(r.role + ' ' + r.can)).map((r) => (
                  <div key={r.role} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-2.5">
                    <div className="w-28 shrink-0 text-[13.5px] font-semibold text-ls-ink">{r.role}</div>
                    <div className="text-[13px] text-ls-ink-2 leading-relaxed">{r.can}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Header tools */}
          {match('header tools whats new notifications assistant chat feedback settings sign out') && (
            <SectionCard>
              <SectionHeading id="tools" icon={Settings} title="Header tools" sub="The icons in the top-right of every page" />
              <ul className="space-y-2.5">
                <li className="flex items-center gap-3 text-[13.5px] text-ls-ink-2"><Bell size={15} className="text-ls-primary" /><span><strong className="text-ls-ink">Notifications</strong> — updates that need your attention.</span></li>
                <li className="flex items-center gap-3 text-[13.5px] text-ls-ink-2"><Sparkles size={15} className="text-ls-primary" /><span><strong className="text-ls-ink">What&apos;s New</strong> — recent releases and changes.</span></li>
                <li className="flex items-center gap-3 text-[13.5px] text-ls-ink-2"><Bot size={15} className="text-ls-primary" /><span><strong className="text-ls-ink">AI Assistant</strong> — chat that is aware of your current screen.</span></li>
                <li className="flex items-center gap-3 text-[13.5px] text-ls-ink-2"><MessageSquare size={15} className="text-ls-primary" /><span><strong className="text-ls-ink">Feedback</strong> — send a note about anything in the app.</span></li>
                <li className="flex items-center gap-3 text-[13.5px] text-ls-ink-2"><Settings size={15} className="text-ls-primary" /><span><strong className="text-ls-ink">Settings</strong> — administration (admins only).</span></li>
              </ul>
            </SectionCard>
          )}

          {/* Tips */}
          {match('tips faq help getting started') && (
            <SectionCard>
              <SectionHeading id="tips" icon={Lightbulb} title="Tips" sub="Get the most out of the system" />
              <ul className="space-y-2">
                {TIPS.filter((t) => match(t)).map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-ls-ink-2 leading-relaxed">
                    <Lightbulb size={15} className="text-ls-watch shrink-0 mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <p className="text-[12px] text-ls-ink-3 text-center pt-2">
            Need more help? Use the feedback icon in the header, or ask the AI Assistant.
          </p>
        </div>
      </div>
    </div>
  );
}
