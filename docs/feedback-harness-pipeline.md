# How Dreadnought Runs the Feedback → Auto-Fix Loop in Signal (RCDO)

**Part-one reference doc — for Mark's review before we build the Foundry harness**

**Author:** Sarah Light · **Date:** 2026-06-01 · **Status:** Draft for review (v1)
**Reviewer:** Mark Friedman — please confirm accuracy and up-level where needed.
**Purpose:** Document, precisely and end-to-end, how the Dreadnought operating system is used inside the Signal / RCDO app to *proactively pull user feedback and process it* — the bug-triage skill and the scheduled debug agent. This is the source of truth we lock down before designing/building the equivalent harness in Foundry. No Foundry build happens until this doc is right.

**Primary sources (all paths under the Dreadnought workspace):**
- `1-ST6/Dreadnought/Debug Agent — Design Request v1.md` (canonical design)
- `1-ST6/Dreadnought/0-Claude Skills/debug-agent/SKILL.md` (v1.5)
- `1-ST6/Dreadnought/0-Claude Skills/bug-triage/SKILL.md` (v1)
- `1-ST6/Dreadnought/0-Claude Skills/feedback-triage/SKILL.md` (v3)
- `1-ST6/PA/RCDO App/CLAUDE-module.md` (v1.5)
- `1-ST6/PA/RCDO App/3-Sessions/2026-04-13-session-log.md` (the scheduling decision)
- `1-ST6/PA/RCDO App/4-Project Management/debug-agent-run-2026-05-15-1604.md` (a real run)

---

## 1. Executive summary — the loop in one breath

A user hits a bug in Signal and files feedback from inside the app (with screen attribution and, for chat bugs, a full debug log). That feedback lands in Signal's own Postgres database and is exposed through a feedback API. On a schedule, an automated **debug agent** running in Cowork wakes up, pulls the open bug reports through that API, filters them to the screens it's allowed to touch, diagnoses each one against the live codebase, and **scores its own confidence**. High-confidence bugs it fixes itself — writes the code, audits it, pushes to dev, smoke-tests, spot-checks the feature, and then resolves the feedback item (notifying the user). Anything it isn't confident about, it diagnoses as far as it can and **routes to a human** for review, with the full diagnosis attached. It never touches production, and any test failure triggers an automatic revert so dev is never left broken.

That loop is assembled from a small cast of Dreadnought skills, with one orchestrator (`debug-agent`) calling the others.

---

## 2. The cast — which skills and agents are involved

Mark named two pieces in the brief: a **bug-triage skill** ("uses the API, pulls feedback from Signal, diagnoses issues") and a **debug agent** (scheduled, "classifies an issue, fixes it if it can, otherwise tees it up for human review"). Those are the two stars. In the actual implementation the "pull feedback" and "diagnose" responsibilities are split across three skills, with two more as dependencies. Worth getting this exactly right before we replicate it.

| Component | Type | Role in the loop | Source file |
|---|---|---|---|
| **debug-agent** | Scheduled agent (orchestrator) | The thing that runs on a schedule. Executes the 11-step pipeline, owns the confidence gate, decides auto-fix vs. route-to-human, and writes the run record. Calls the other skills rather than duplicating them. | `debug-agent/SKILL.md` v1.5 |
| **bug-triage** | Skill (diagnosis engine) | The root-cause engine. Parses evidence, traces the code path, classifies the root cause, checks Design-Decision Verification Criteria, proposes a fix. Interactive when a human runs it; the debug-agent runs the same logic without a human in the loop. | `bug-triage/SKILL.md` v1 |
| **feedback-triage** | Skill (transport) | The thing that actually *talks to Signal's API* — fetch open feedback, resolve items, upload resolution screenshots — with a Chrome → curl → paste fallback chain. The debug-agent borrows this transport logic for its fetch and resolve steps. | `feedback-triage/SKILL.md` v3 |
| **code-audit** | Skill (verification) | Post-fix check: runs the staged diff against the relevant DD Verification Criteria. If any criterion fails, the agent does not push. | dependency |
| **repo-connect** | Skill (plumbing) | Clones/pulls the Signal repo into `/tmp` at the start of each run so the agent can read and edit code. | dependency |

**Clarification for the record:** the brief attributes "pulls feedback from Signal + diagnoses" to the bug-triage skill. In the built system that's two skills — **feedback-triage** does the pulling (it's the API transport), **bug-triage** does the diagnosing. The **debug-agent** is what stitches pull + diagnose + fix + verify + resolve into one unattended pipeline. When we build Foundry's harness we inherit all three, not just one.

---

## 3. The application — Signal / RCDO

**Signal** (also called the RCDO App Tool / RCDO Hierarchy Tool) is a standalone strategic-planning and weekly-commitment web app. It is *not* part of the PA production platform — it has its own GitHub repo, its own Postgres database, and its own passwordless auth.

| Attribute | Value |
|---|---|
| GitHub repo | `mhf-st6partners/rcdo-hierarchy-tool` |
| Deployed URL (prod **and** dev) | `https://rcdo-hierarchy-tool.replit.app/` |
| Hosting | Replit — dev auto-builds from `main`; production is the same project, promoted by a manual **Republish** click (commit-level promotion). Separate databases for dev vs. prod. |
| Stack | React 18 client · Node/Express server · Postgres 15+ · Anthropic SDK for the in-app Claude chat |
| Users | ~25–30 |
| Active screens (per CLAUDE-module.md v1.5) | **WorkspaceView** (tree + table + detail + Claude chat), **MyWeekPage** (weekly planner + Claude chat tray), **ExecutionDashboard** (CEO analytics + Claude chat tray, ELT-only) |

The deployment model matters for the agent: because dev and prod share a Replit project but use separate databases, the agent can push to `main` (dev) and do full CRUD verification on dev data safely, while production stays behind a human Republish click.

---

## 4. How customer feedback is captured

Feedback is filed by users *inside* Signal, not through an external tracker. Each item carries enough structured context for an agent to act on it without a human re-explaining the bug:

- **Type** — `bug`, `enhancement`, or `question`.
- **Screen attribution** — which screen the user was on (e.g. `chat`/`claude`, `my-week`/`myweek`, `hierarchy`/`workspace`, `admin`). This is the single most important field for the agent — no screen, no trace.
- **Severity / priority** — `blocking` / `annoying` / `nice_to_have`; priority high/medium/low.
- **Description + title** — the user's own words.
- **Context path** — `context_item_path`, the hierarchy item or location in view.
- **Interactive AI Review at submit (deflection).** Hitting "submit" doesn't file the ticket straight away — the system **intercepts before saving** and calls `POST /api/feedback/ai-review`. Claude checks for (1) an existing answer (questions already answered in specs/docs), (2) a duplicate (with "Me too" voting), and (3) related context, and shows it in an AI Review Panel. The user can then **resolve without submitting**, vote on an existing item, or submit as new. Only on submit-as-new is the item saved, storing `ai_review_result` plus AI-enhanced `claude_title` / `claude_description` (alongside the user's originals) and a suggested priority. Deflection is a tracked metric. (RCDO Design Decisions v52.)
- **Debug session link** — for chat bugs, `chat_debug_session_id` points to a full debug log (see §5).
- **Attachments** — screenshots, with an `attachment_count` and an attachments array.
- **Submitter** — name + timestamp (`created_at`).

---

## 5. The data model

### 5.1 Feedback item (the `feedback` table)

Core fields the pipeline reads: `id`, `type`, `status`, `screen`, `priority`, `severity`, `title`, `description`, `context_item_path`, `ai_review_result`, `claude_title`, `claude_description`, `chat_debug_session_id`, `attachment_count`, `created_at`, submitter name.

Status lifecycle: `open` → `in_progress` / `acknowledged` → `resolved` / `wont_fix`, plus a dedicated `pm_review` state for agent-diagnosed-but-not-fixed items (added in debug-agent v1.4).

**Resolution attribution columns** (added for the agent, Design Request §6 & §9):

```sql
ALTER TABLE feedback ADD COLUMN resolved_by_type VARCHAR(10) DEFAULT 'human';  -- 'agent' | 'human'
ALTER TABLE feedback ADD COLUMN agent_run_id VARCHAR(50);                       -- NULL for human-resolved
```

These let the admin tab filter agent vs. human resolutions and give the agent an audit trail.

### 5.2 The debug log (`chat_debug_log` table)

The richest diagnostic signal for chat bugs. Keyed by `chat_debug_session_id`. Each entry captures the full Claude loop: per-loop API timing, the tool name and tool input, Claude's text, `stop_reason`, token counts, and `tool_result_error`. The diagnosis engine reads it for tells like `stop_reason: "end_turn"` on a loop that should have called a tool (Claude skipped the tool), non-null `tool_result_error` (tool execution failed), or a `loop_count` higher than expected (Claude going in circles).

### 5.3 Agent run records (`debug_agent_runs`)

Each scheduled run creates a run record (run ID format `debug-agent-<module-slug>-YYYY-MM-DD-HHMM`) and updates it on completion with counts (fetched / attempted / resolved / routed-to-PM / failed) and a `run_log` JSONB array of per-item outcomes. An Agent Runs dashboard lives inside Signal's Admin → System Jobs tab (sub-tabs: Lifecycle Jobs / Agent Runs) with a time-frame selector.

---

## 6. The feedback API surface

Base URL: `https://rcdo-hierarchy-tool.replit.app`. Auth is an API-key header. **Note a real inconsistency to resolve:** the `feedback-triage` skill reads the key from env var `ADMIN_API_KEY`, while the `debug-agent` config block specifies `x-api-key: rcdo-cowork-2026`. Both appear in the docs; we should confirm the single source of truth before replicating.

| Purpose | Method + endpoint | Notes |
|---|---|---|
| Fetch open feedback | `GET /api/feedback/export?status=open&type=bug` | Supports `?type=`, `?status=`, `?since=`. Returns items incl. debug session IDs, attachment metadata, AI review. |
| Resolve / won't-fix | `PUT /api/feedback/:id/resolve` | Body: `status`, `resolution_notes`, `resolved_by_name` (interactive) **or** `resolved_by_type:'agent'`, `agent_run_id`, `admin_notes` (agent). Terminal. Triggers submitter + admin notifications. |
| Acknowledge / update | `PUT /api/feedback/:id` | Body: `status:'acknowledged'`, `admin_notes`. |
| Agent review (route to human) | `PUT /api/feedback/agent-review/:id` | Sets status `pm_review`, writes full structured `admin_notes` JSON, links `agent_run_id`. Used for Assisted/Manual tiers. |
| Create agent run | `POST /api/feedback/agent-runs` | Creates the run record. *(Known bug: a 2026-05-15 run got `{"error":"Run id required"}` — the endpoint may expect a different field name than `run_id`; flagged for fix.)* |
| Update agent run | `PUT /api/feedback/agent-runs/:id` | Final counts + `run_log`. |
| Attachments | `GET /api/feedback/:id/attachments` and `/attachments/:attId` | List + fetch screenshots. |
| Resolution screenshot | `POST /api/feedback/:id/resolution-screenshot` | Multipart upload of a "here's the fix" image. |
| Agent runs / stats (admin UI) | `GET /api/feedback/agent-runs`, `/agent-runs/:id/items`, `/agent-stats` | Powers the Agent Runs dashboard. |

**Transport (from feedback-triage v3):** the Cowork sandbox proxy blocks the Replit domain over plain curl, so the order is **Chrome `javascript_tool` (preferred, runs `fetch()` same-origin) → curl → paste-based** (generate the curl, user runs it in Replit Shell and pastes the JSON back).

---

## 7. The debug-agent pipeline (11 steps)

The agent is module-aware: every concrete URL, endpoint, screen-allowlist, and payload shape comes from a per-module config block in the skill. The step logic itself is module-agnostic.

1. **Connect & fetch** — `repo-connect` clones/pulls the repo; fetch open bugs via the export endpoint (Chrome→curl→paste); generate a run ID; create the run record.
2. **Filter candidates** — keep an item only if it's a bug, newer than the **max item age (14 days)**, has screen attribution, and the screen is on the **whitelist** (Phase 1: Claude chat, My Week, Hierarchy Manager). Everything else is skipped (not escalated — just not agent-fixable yet).
3. **Type reclassification (2.5)** — an `enhancement` that passed screen whitelisting but reads like a bug (≥2 indicators: "doesn't work," "broken," contrasts wrong vs. expected behavior, implied fix changes existing logic) gets reclassified as a bug candidate.
4. **Diagnose** — parse evidence (description + `ai_review_result` + debug log if `chat_debug_session_id` exists), trace the code path, identify root cause file+line, classify the category.
5. **Confidence gate** — score 4 signals, route by tier (see §8).
6. **Write fix** (auto-fix tier only) — make the change; commit with the mandatory prefix `[debug-agent] Fix feedback #<ID>: <one-line>`; do **not** push yet.
7. **Code audit** — run `code-audit` against the staged diff and the relevant DD Verification Criteria. Any failure → undo the commit, route to PM review, stop.
8. **Push to dev** — `git push origin main`; poll the dev health endpoint for the rebuild (3-min timeout). Merge conflict → reset, skip, retry next run.
9. **Smoke test** — run the module's Smoke Test Manifest (every route → expected DOM selector). Any failure → `git revert`, push the revert, route to PM review.
10. **Functional spot-check** — exercise the specific feature the fix touched (e.g. send a chat message and confirm a response; load My Week and confirm the effort bar). Clean up any test data. Failure → revert, push, route to PM review.
11. **Resolve & report** — call the resolve endpoint with `resolved_by_type:'agent'`, `agent_run_id`, and a structured `admin_notes` JSON (the 4-section diagnosis the admin UI renders); then update the run record and write a run summary. Resolving fires an `agent_resolution` notification to admins and a `feedback_response` to the submitter.

**The fix order is fetch → filter → diagnose → gate → fix → audit → push → smoke → spot-check → resolve → report**, and the gate is the hinge between "the agent fixes it" and "a human does."

---

## 8. Confidence model & routing

Four signals, each scored 1–3; the sum (4–12) sets the tier.

| Signal | 3 (high) | 2 (medium) | 1 (low) |
|---|---|---|---|
| Root-cause clarity | Single cause, exact file+line | 2–3 candidates, same area | Unclear / scattered |
| Fix scope | 1 file | 2–3 files | 4+ files or cross-cutting |
| Fix category | prompt-gap / data-issue | logic-error / missing-validation | race-condition, ui-rendering, model-behavior, api-contract |
| Precedent | 3+ similar fixes succeeded | 1–2 similar | none |

| Score | Tier | Action |
|---|---|---|
| 10–12 | **Auto-fix** | Run the full fix→verify→resolve pipeline |
| 7–9 | **Assisted** | Diagnosis + proposed fix written to PM review, agent stops |
| ≤6 | **Manual** | Diagnosis only written to PM review, agent stops |

**Override:** a score of 9 with root-cause-clarity = 3 **and** fix-scope ≥ 2 is promoted to Auto-fix — high certainty about the cause plus a contained fix beats the category label alone.

Items below the auto-fix line still get the *full structured diagnosis* via `PUT /api/feedback/agent-review/:id` (status `pm_review`), so the human inherits the agent's work rather than starting cold. The admin UI renders the same 4-section diagnosis panel for these in amber (vs. blue for resolved). Before go-live the model was meant to be **backtested against all historical human-resolved items** to calibrate the thresholds and measure the false-positive rate (Design Request §4).

---

## 9. Safety invariants

- **The agent never touches production.** It pushes only to `main` (dev). Production promotion stays a human Republish click. Blank-screen risk in prod from the agent is zero.
- **Dev is never left broken.** Every failure path that could break dev triggers an automatic `git revert` + push of the revert. After any failure the dev branch is either unchanged or restored to its pre-agent state.
- **Commits are identifiable.** The `[debug-agent]` commit prefix makes agent changes obvious in git log and Replit publish history.
- **Bounded work.** Max 3 attempts per bug, max 30 items per run, 14-day max item age.
- **Resolve is idempotent-ish.** If the resolve API call fails, the fix stays on dev and the item stays open to be retried next run.

---

## 10. Scheduling — how/when the agent actually runs

**This is the field to correct against the brief.** The brief says "hourly during business hours," and the original Design Request (§11) said Phase 1 would run **once per day at ~3 AM ET** via the Cowork `schedule` skill. Neither is what's actually running.

The authoritative decision is in `RCDO App/3-Sessions/2026-04-13-session-log.md`:

- Mark investigated whether the agent could run as a **server-side cron** and concluded **it can't** — the full pipeline needs Cowork-only capabilities (repo clone, code writes, git push). A server-side cron can't clone the repo and push fixes.
- Decision (2026-04-13): pause the server-side `deployment-check` cron and run the **full pipeline as a Cowork scheduled task `debug-agent-rcdo`, every 2 hours from 9am to 11pm.**

So the accurate statement is: **a Cowork scheduled task named `debug-agent-rcdo`, firing every 2 hours between 9am and 11pm** (≈8 runs/day across business + evening hours). It is *not* literally hourly, and it is *not* the once-daily 3 AM described in the design doc. The 2026-05-15 run record confirms the trigger ("Triggered by: Scheduled task (debug-agent-rcdo)").

For Foundry we'll need to decide our own cadence — and remember the same constraint: the harness must run in Cowork (or an equivalent agent runtime), not as a plain server cron.

---

## 11. Notifications

Built on the DD-138 notification system. Resolving an item (agent or human) sends:
- **To the submitter** — a `feedback_response` notification with the plain-language resolution note (no jargon; written for the person who filed it).
- **To admins** — an `agent_resolution` notification: robot/gear icon, blue accent, expandable to show original item, diagnosis summary, confidence score, linkable commit hash, files changed, with "Looks good" (dismiss) and "Review in dev" (opens dev to the screen) actions. Desktop admins can revert a bad resolution from the notification; mobile is read-only for agent actions.

---

## 12. What a real run looks like (2026-05-15, 16:04)

A concrete, instructive example of the *route-and-skip* behavior:
- Fetched 3 open bugs + 1 enhancement.
- **0 eligible after filter** — all 3 bugs had `screen: "admin"`, which is **not** in the Phase 1 whitelist, so all were skipped at Step 2 with no diagnosis attempted. The enhancement (also `admin`) wasn't reclassified because screen-whitelisting comes first.
- The bugs were real (live-transcription issues, Loom evidence) — the agent simply isn't authorized for that screen yet.
- Infra note: the Linux sandbox was down that run (disk exhaustion), so the agent fell back to Chrome MCP for API calls; repo clone wasn't possible but wasn't needed since nothing passed the filter.
- The agent's own observation to the PM: either expand the whitelist to include `admin`, or triage these manually.

The takeaway: **the whitelist is doing real gatekeeping**, and a run that fixes nothing is a normal, successful outcome.

---

## 13. Gaps & RCDO-specific assumptions that matter for Foundry

These are the things that will bite us if we copy RCDO naively into Foundry:

1. **Whitelist drift / screen naming.** The agent's whitelist (chat, my-week, hierarchy) predates RCDO's current active screens (WorkspaceView, MyWeekPage, **ExecutionDashboard**). `ExecutionDashboard` (analytics) isn't whitelisted, and the `admin` screen — where real bugs are landing — is excluded. Foundry's whitelist (Mission Map, Mission Builder, Concept Bank, per debug-agent v1.5) needs to match Foundry's actual screens and be kept in sync.
2. **API key inconsistency.** `ADMIN_API_KEY` (feedback-triage) vs. `x-api-key: rcdo-cowork-2026` (debug-agent). Pin down one before replicating. Foundry already uses a distinct key (`FOUNDRY_AGENT_API_KEY` / `foundry-cowork-2026`).
3. **Payload-shape divergence (already real).** Foundry's agent-review endpoint takes a different shape than RCDO's: RCDO sends `admin_notes` as a JSON **string**; Foundry's `PUT /api/admin/bug-reports/:id/agent-review` takes `agent_diagnosis` as a JSON **object** plus `agent_status` enum, `agent_pr_url`, `close_status`. Foundry also stores confidence as a normalized 0–1 float, not RCDO's 4–12 score. The debug-agent skill already encodes both — but it's the #1 thing to get right, since a mismatch shows up as Zod parse errors on the receiving side.
4. **agent-runs POST bug.** RCDO's `POST /api/feedback/agent-runs` returned "Run id required" on 2026-05-15 — an unresolved field-name mismatch. Don't inherit the bug.
5. **Smoke Test Manifest is module-specific.** RCDO's selectors were left "TBD — verify against codebase" in the design doc. Foundry's own `5-Technical/Smoke Test Manifest v1.md` **already exists** (authored 2026-05-21, 7 sections covering Mission Map / Builder / Concept Bank, intake, agent-runs, migrations, corpus) — so this is built for Foundry, not a gap. RCDO's selectors still want a verification pass.
6. **Calibration/backtest was a go-live gate that we should honor.** The Design Request requires backtesting the confidence model against historical resolved feedback before enabling auto-resolution. Worth repeating for Foundry rather than enabling auto-fix cold.
7. **Runtime constraint.** The pipeline can't run as a server-side cron — it needs Cowork's repo/clone/push capabilities. Whatever schedules Foundry's agent has to provide those.

---

## 14. What this means for the Foundry harness (preview of part two)

Not for build yet — listed so Mark can sanity-check scope. Foundry already has a config block in `debug-agent` v1.5 (added 2026-05-21), a distinct repo (`ST6-Partners/Foundry`), its own admin bug-report endpoints, its own auth key, and a normalized-float confidence convention. The harness work is therefore mostly: (a) confirm/seed the Foundry feedback-capture + API surface, (b) author Foundry's Smoke Test Manifest with real selectors, (c) reconcile the whitelist to Foundry's real screens, (d) backtest/calibrate, (e) stand up the Cowork scheduled task with a chosen cadence. Details to follow once this doc is confirmed.

---

## 15. Open questions — resolved (Sarah, 2026-06-01)

1. **Cadence:** ✅ Foundry runs **every 2 hours, 9am–11pm** (matches Signal). Note: supersedes Foundry's DD-AAF-04 (manual-only) — that DD needs a version bump.
2. **Schedule wording:** ✅ confirmed — the "hourly during business hours" framing was shorthand; the real cadence (Signal and now Foundry) is every 2 hours, 9am–11pm.
3. **API key:** ✅ Foundry uses its **own** key `foundry-cowork-2026` (env `FOUNDRY_AGENT_API_KEY`), never RCDO's. (The flagged item was an inconsistency inside RCDO's own docs — `ADMIN_API_KEY` in feedback-triage vs. `rcdo-cowork-2026` in debug-agent; still worth pinning down on the RCDO side, but moot for Foundry.)
4. **Whitelist philosophy:** ✅ whitelist the screens — Foundry whitelists Mission Map / Mission Builder / Concept Bank, widening later once runs are clean.
5. **Auto-fix gate:** ✅ no separate backtest/hold-back phase — arm auto-fix at high confidence (`≥0.8` float ≈ 10/12) from day one and tune live.
6. Open for Mark: anything in §13 to re-frame or correct.
