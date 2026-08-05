// ============================================================
// FAIRNESS PANEL (admin) — adverse-impact monitor
//
// Aggregate four-fifths view of the automated assessment gate,
// per role. Reads trpc.eeo.audit (admin-gated, aggregate only).
// Never shows candidate-level demographics.
// ============================================================

import { useState } from 'react';
import { ShieldAlert, Lock, ChevronRight, ChevronDown } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const GREEN = '#1D9E75';
const RED = '#E24B4A';

function StatusText({ status }: { status: string }) {
  if (status === 'reference') return <span style={{ fontSize: 12, color: '#6b7280' }}>Top group</span>;
  if (status === 'flagged') return <span style={{ fontSize: 12, color: RED, fontWeight: 500 }}>Flagged</span>;
  if (status === 'ok') return <span style={{ fontSize: 12, color: GREEN }}>Within range</span>;
  return <span style={{ fontSize: 12, color: '#9ca3af' }}>Too few to report</span>;
}

function Dimension({ dim }: { dim: any }) {
  const ref = dim.groups.find((g: any) => g.group === dim.reference);
  const refRate: number | null = ref?.passRate ?? null;
  const fairLine = refRate != null ? refRate * 0.8 : null;

  const hasReportable = dim.groups.some((g: any) => g.status !== 'insufficient');

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#374151' }}>{dim.label}</div>
      {!hasReportable && (
        <div style={{ fontSize: 13, color: '#9ca3af' }}>Not enough responses yet to report on this dimension.</div>
      )}
      {dim.groups.map((g: any) => (
        <div key={g.group} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 150, flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: g.status === 'insufficient' ? '#9ca3af' : '#111827' }}>{g.group}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {g.passed != null ? `${g.passed} of ${g.assessed} cleared it` : `${g.assessed} candidates`}
              </div>
            </div>
            {g.status === 'insufficient' ? (
              <div style={{ flex: 1, fontSize: 12, color: '#9ca3af' }}>Too few candidates to report reliably (under 30)</div>
            ) : (
              <div style={{ flex: 1, position: 'relative', height: 26, background: '#f3f4f6', borderRadius: 6 }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${g.passRate}%`,
                  background: g.status === 'flagged' ? RED : GREEN,
                  borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 8, fontSize: 12, color: '#fff',
                }}>{g.passRate}%</div>
                {fairLine != null && (
                  <div title="Four-fifths of the top group's rate. Bars short of this line are flagged."
                    style={{ position: 'absolute', left: `${fairLine}%`, top: -3, height: 32, borderLeft: '2px dashed #6b7280' }} />
                )}
              </div>
            )}
            <div style={{ width: 96, flexShrink: 0 }}><StatusText status={g.status} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

const DISP_LABELS: Record<string, string> = {
  open: 'Open — no action',
  reviewed_no_change: 'Reviewed, no change needed',
  remediation_applied_monitoring: 'Remediation applied — monitoring',
  snoozed: 'Snoozed',
};
// Legacy label still rendered if an old row carries this retired status.
const LEGACY_DISP_LABELS: Record<string, string> = { ...DISP_LABELS, validated_documented: 'Validated & documented' };

function flaggedCount(dims: any[]): number {
  return dims.reduce((n, d) => n + d.groups.filter((g: any) => g.status === 'flagged').length, 0);
}

// ── Remediate-this-flag: the workbench under the audit ──────
function Remediation({ jdId, baseCutoff, liveFlagged }: { jdId: string; baseCutoff: number; liveFlagged: number }) {
  const [cutoff, setCutoff] = useState<number>(baseCutoff);
  const [status, setStatus] = useState<string>('remediation_applied_monitoring');
  const [note, setNote] = useState<string>('');
  const [snoozeDays, setSnoozeDays] = useState<number>(30);
  const [saved, setSaved] = useState<boolean>(false);

  const sim = trpc.eeo.simulateCutoff.useQuery({ jdId, cutoff }, { enabled: !!jdId, keepPreviousData: true });
  const disp = trpc.eeo.getDisposition.useQuery({ jdId }, { enabled: !!jdId });
  const setDisposition = trpc.eeo.setDisposition.useMutation({
    onSuccess: () => { setSaved(true); disp.refetch(); },
  });

  const simFlagged = sim.data ? flaggedCount(sim.data.dimensions) : null;
  const lowered = cutoff < baseCutoff;
  const current = disp.data as any;

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 22, paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Remediate this flag</div>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', background: '#EAF4FA', color: '#246F97', border: '1px solid #cfe6f4', borderRadius: 999, padding: '3px 9px' }}>New</span>
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, margin: '8px 0 14px' }}>
        The one legal, group-blind lever the gate actually has is the cutoff itself. Model a new CCAT cutoff below and the four-fifths
        audit re-runs on the same candidates. This never changes the live gate — it only previews. Any change applies to <b>everyone</b>;
        the app will not adjust scores by group.
      </div>

      {/* Cutoff simulator */}
      <div style={{ background: '#f9fafb', border: '1px solid #eef0f2', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Preview CCAT cutoff</label>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#2E89B8' }}>{cutoff}</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}> / 50 · current gate is {baseCutoff}</span>
          </div>
        </div>
        <input type="range" min={15} max={40} step={1} value={cutoff}
          onChange={(e) => { setCutoff(Number(e.target.value)); setSaved(false); }}
          style={{ width: '100%', accentColor: '#2E89B8', marginTop: 10 }} />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginTop: 6 }}>
          <div><span style={{ color: '#6b7280' }}>Groups flagged now</span> <b style={{ color: liveFlagged ? RED : '#111827' }}>{liveFlagged}</b></div>
          <div style={{ color: '#9ca3af' }}>→</div>
          <div><span style={{ color: '#6b7280' }}>at cutoff {cutoff}</span> <b style={{ color: (simFlagged ?? 0) ? RED : GREEN }}>{simFlagged ?? '…'}</b></div>
          {cutoff !== baseCutoff && (
            <button onClick={() => { setCutoff(baseCutoff); setSaved(false); }}
              style={{ marginLeft: 'auto', background: '#fff', color: '#2E89B8', border: '1px solid #cfe6f4', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reset to {baseCutoff}</button>
          )}
        </div>

        {sim.data && (
          <div style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.6, marginTop: 10, background: '#fff', border: '1px solid #eef0f2', borderRadius: 6, padding: '9px 11px' }}>
            {lowered
              ? <>Lowering the cutoff to {cutoff} lets through <b>{sim.data.addedCount}</b> more candidate{sim.data.addedCount === 1 ? '' : 's'} on this role{sim.data.addedMedianPercentile != null ? <> (median CCAT percentile <b>{sim.data.addedMedianPercentile}</b>)</> : ''}. Real candidates, not a synthetic score — check they clear the bar you'd actually defend as job-related.</>
              : cutoff > baseCutoff
                ? <>Raising the cutoff to {cutoff} removes <b>{sim.data.removedCount}</b> candidate{sim.data.removedCount === 1 ? '' : 's'} who currently pass. This usually widens the gap, not closes it.</>
                : <>This is the current gate. Move the slider to preview a change.</>}
          </div>
        )}
      </div>

      {/* Simulated four-fifths bars */}
      {sim.data && cutoff !== baseCutoff && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>Four-fifths audit at cutoff {cutoff} (preview)</div>
          {sim.data.dimensions.filter((d: any) => d.groups.some((g: any) => g.status !== 'insufficient')).map((d: any) => <Dimension key={d.key} dim={d} />)}
        </div>
      )}

      {/* Disposition / close-out */}
      <div style={{ background: '#f9fafb', border: '1px solid #eef0f2', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Close out this flag</div>
        <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, marginBottom: 10 }}>
          Record what you decided. An acknowledged flag stops the weekly re-alert; a snooze quiets it for a set window. Everything is logged with your name.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setSaved(false); }}
            style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff' }}>
            {Object.entries(DISP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {status === 'snoozed' && (
            <label style={{ fontSize: 12, color: '#6b7280' }}>for
              <input type="number" min={1} max={365} value={snoozeDays} onChange={(e) => setSnoozeDays(Number(e.target.value))}
                style={{ width: 60, margin: '0 6px', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} /> days</label>
          )}
          <button onClick={() => setDisposition.mutate({ jdId, status: status as any, note: note || undefined, snoozeDays: status === 'snoozed' ? snoozeDays : undefined })}
            disabled={setDisposition.isLoading}
            style={{ background: '#2E89B8', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {setDisposition.isLoading ? 'Saving…' : 'Save disposition'}
          </button>
        </div>
        <input placeholder="Optional note (what you changed / why it's justified)" value={note} onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%', marginTop: 10, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }} />
        {(saved || current) && (
          <div style={{ fontSize: 12.5, color: '#136047', marginTop: 10 }}>
            {saved ? '✓ Saved. ' : ''}Current status: <b>{LEGACY_DISP_LABELS[current?.status] ?? LEGACY_DISP_LABELS[status]}</b>
            {current?.decidedByName ? <> — set by {current.decidedByName}</> : ''}
            {current?.snoozeUntil ? <> · quiet until {new Date(current.snoozeUntil).toLocaleDateString()}</> : ''}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: '#9ca3af', lineHeight: 1.6, marginTop: 12 }}>
        A cutoff change is a real selection-procedure change with legal weight. Use this to support a documented, job-related
        validation your counsel (and ideally an I-O psychologist) signs off on — not to make the call automatically.
      </div>
    </div>
  );
}

// ── The full audit + remediation for one role (shown when a row expands) ──
function RoleDetail({ jdId }: { jdId: string }) {
  const { data: audit, isLoading, refetch } = trpc.eeo.audit.useQuery({ jdId }, { enabled: !!jdId });
  const retryWrites = trpc.decisions.retryFailures.useMutation({ onSuccess: () => refetch() });

  const lowResponse = audit && audit.responseRate < 50;
  const flagged = audit
    ? audit.dimensions.reduce((n: number, d: any) => n + d.groups.filter((g: any) => g.status === 'flagged').length, 0)
    : 0;

  if (isLoading || !audit) return <div style={{ fontSize: 13, color: '#9ca3af', padding: '10px 2px' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18, fontSize: 13 }}>
        <div><span style={{ color: '#6b7280' }}>Assessed</span> <span style={{ fontWeight: 600 }}>{audit.assessed}</span></div>
        <div><span style={{ color: '#6b7280' }}>Answered the voluntary survey</span> <span style={{ fontWeight: 600 }}>{audit.responseRate}%</span></div>
        <div><span style={{ color: '#6b7280' }}>Groups flagged</span> <span style={{ fontWeight: 600, color: flagged ? RED : '#111827' }}>{flagged}</span></div>
      </div>

      {audit.integrityGap > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fef2f2', color: '#991b1b', borderRadius: 6, padding: '10px 12px', marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
          <ShieldAlert size={18} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {audit.integrityGap} assessment decision{audit.integrityGap > 1 ? 's' : ''} for this role could not be recorded, so this audit may be missing those candidates. Replay the dropped records to make it complete.
          </span>
          <button
            onClick={() => retryWrites.mutate()}
            disabled={retryWrites.isLoading}
            style={{ flexShrink: 0, background: '#991b1b', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {retryWrites.isLoading ? 'Replaying…' : 'Replay records'}
          </button>
        </div>
      )}

      {lowResponse && (
        <div style={{ display: 'flex', gap: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '10px 12px', marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
          <ShieldAlert size={18} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Only {audit.responseRate}% of assessed candidates answered the survey. Results are unreliable at this response rate — treat any flag as a prompt to investigate, not a conclusion.</span>
        </div>
      )}

      {flagged > 0 && !lowResponse && (
        <div style={{ display: 'flex', gap: 10, background: '#fef2f2', color: '#991b1b', borderRadius: 6, padding: '10px 12px', marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
          <ShieldAlert size={18} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{flagged} group{flagged > 1 ? 's' : ''} on this role pass below the four-fifths (0.80) threshold. Review whether a score of 30 is job-related for this role.</span>
        </div>
      )}

      {audit.dimensions.map((d: any) => <Dimension key={d.key} dim={d} />)}

      {flagged > 0 && (
        <Remediation jdId={jdId} baseCutoff={(audit as any).baseCutoff ?? 30} liveFlagged={flagged} />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: '1px solid #f3f4f6', paddingTop: 14, marginTop: 4 }}>
        <Lock size={14} style={{ color: '#9ca3af', marginTop: 2 }} />
        <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
          An internal early-warning tool, not a compliance determination. Groups under 30 are not scored.
        </div>
      </div>
    </div>
  );
}

// Short disposition pill for a summary row.
function dispPill(status: string | null, snoozeUntil: any): { text: string; bg: string; fg: string } | null {
  if (!status || status === 'open') return null;
  if (status === 'snoozed') {
    const until = snoozeUntil ? ` to ${new Date(snoozeUntil).toLocaleDateString()}` : '';
    return { text: `Snoozed${until}`, bg: '#eef0f2', fg: '#51606A' };
  }
  const map: Record<string, string> = {
    reviewed_no_change: 'Reviewed',
    validated_documented: 'Documented',
    remediation_applied_monitoring: 'Monitoring',
  };
  return { text: map[status] ?? status, bg: '#E6F4EF', fg: '#136047' };
}

// Append-only history of every bias alert that has fired. Shown at the very
// bottom of the tab. Undeletable from the UI — the durable record.
function AlertHistory() {
  const { data } = trpc.eeo.alertHistory.useQuery();
  const rows = data ?? [];
  return (
    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 24, paddingTop: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827' }}>Alert history</div>
      <div style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 12px', lineHeight: 1.6 }}>
        Every bias alert that has fired, with its date. This is a permanent record — it can't be deleted here
        or from the notification bell, so an alert can't be lost even if someone dismisses the notification.
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#9ca3af' }}>No alerts have fired yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 12.5, padding: '8px 11px', background: '#f9fafb', border: '1px solid #eef0f2', borderRadius: 6 }}>
              <div style={{ width: 150, flexShrink: 0, color: '#51606A', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(r.createdAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: '#111827' }}>{r.jobTitle ?? 'Unknown role'}</span>
                {r.summary ? <span style={{ color: '#6b7280' }}>: {r.summary}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Fairness() {
  const { data: summary, isLoading } = trpc.eeo.flagSummary.useQuery();
  const [openJd, setOpenJd] = useState<string | null>(null);

  const concerns = summary?.concerns ?? [];
  const evaluated = summary?.evaluated ?? 0;
  const screenedOut = Math.max(0, evaluated - concerns.length);

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Fairness check — assessment gate</div>
      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, margin: '6px 0 16px' }}>
        Only roles with an actual, reliable adverse-impact concern are listed. A group is flagged when it
        clears the CCAT cutoff at less than four-fifths (80%) of the top group's rate. Roles with too few
        survey responses to judge are not shown. Click a role to open its full breakdown and remediation.
        Demographics are voluntary, self-reported, shown in aggregate only, and never used to score,
        advance, or reject anyone.
      </div>

      {!isLoading && summary && concerns.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 14 }}>
          <span style={{ fontWeight: 600, color: RED }}>{concerns.length}</span>
          <span style={{ color: '#6b7280' }}> role{concerns.length === 1 ? '' : 's'} with a reliable flag</span>
          {screenedOut > 0 && <span style={{ color: '#9ca3af' }}> · {screenedOut} other role{screenedOut === 1 ? '' : 's'} clear or too few responses to judge</span>}
        </div>
      )}

      {isLoading && <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div>}
      {!isLoading && summary && concerns.length === 0 && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          No reliable adverse-impact concerns right now.
          {evaluated > 0 && <span style={{ color: '#9ca3af' }}> {evaluated} role{evaluated === 1 ? '' : 's'} evaluated — all clear or with too few survey responses to judge.</span>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {concerns.map((r: any) => {
          const open = openJd === r.jdId;
          const pill = dispPill(r.dispositionStatus, r.snoozeUntil);
          return (
            <div key={r.jdId} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenJd(open ? null : r.jdId)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: open ? '#f9fafb' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                {open
                  ? <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                  : <ChevronRight size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />}
                <div style={{ flexShrink: 0, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{r.jobTitle}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.assessed} assessed</div>
                </div>
                <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.lowResponse ? (
                    <span style={{ fontSize: 11.5, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 9px' }}>Low response — unreliable</span>
                  ) : r.flaggedCount === 0 ? (
                    <span style={{ fontSize: 12, color: GREEN }}>Within range</span>
                  ) : (
                    <>
                      {r.flags.slice(0, 3).map((f: any, i: number) => (
                        <span key={i} style={{ fontSize: 11.5, color: '#991b1b', background: '#F8EAE8', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                          {f.group}{f.ratio != null ? ` ${f.ratio}x` : ''}
                        </span>
                      ))}
                      {r.flags.length > 3 && <span style={{ fontSize: 11.5, color: '#991b1b' }}>+{r.flags.length - 3} more</span>}
                    </>
                  )}
                </div>
                {pill && <span style={{ fontSize: 11, fontWeight: 600, background: pill.bg, color: pill.fg, borderRadius: 999, padding: '2px 9px', flexShrink: 0 }}>{pill.text}</span>}
                {r.flaggedCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: RED, borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{r.flaggedCount}</span>
                )}
              </button>
              {open && (
                <div style={{ borderTop: '1px solid #eef0f2', padding: '14px 14px 16px' }}>
                  <RoleDetail jdId={r.jdId} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertHistory />
    </div>
  );
}
