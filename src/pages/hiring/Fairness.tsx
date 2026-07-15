// ============================================================
// FAIRNESS PANEL (admin) — adverse-impact monitor
//
// Aggregate four-fifths view of the automated assessment gate,
// per role. Reads trpc.eeo.audit (admin-gated, aggregate only).
// Never shows candidate-level demographics.
// ============================================================

import { useState } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
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

export default function Fairness() {
  const { data: roles } = trpc.eeo.auditRoles.useQuery();
  const [jdId, setJdId] = useState<string>('');
  const effectiveJd = jdId || roles?.[0]?.jdId || '';
  const { data: audit, isLoading } = trpc.eeo.audit.useQuery(
    { jdId: effectiveJd },
    { enabled: !!effectiveJd },
  );

  const lowResponse = audit && audit.responseRate < 50;
  const flagged = audit
    ? audit.dimensions.reduce((n: number, d: any) => n + d.groups.filter((g: any) => g.status === 'flagged').length, 0)
    : 0;

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Fairness check — assessment gate</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Who cleared the CCAT cutoff of 30, by group</div>
        </div>
        <select value={effectiveJd} onChange={(e) => setJdId(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }}>
          {(roles ?? []).map((r: any) => (
            <option key={r.jdId} value={r.jdId}>{r.jobTitle} ({r.assessed})</option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, margin: '14px 0 18px' }}>
        Each bar is the share of a group that scored 30 or higher. The dashed line sits at four-fifths of
        the top group's rate — a bar that falls short is flagged, meaning that group is clearing the cutoff
        noticeably less often. Demographics are voluntary, self-reported, shown in aggregate only, and never
        used to score, advance, or reject anyone.
      </div>

      {!roles?.length && (
        <div style={{ fontSize: 13, color: '#9ca3af' }}>No roles have assessment-gate decisions yet.</div>
      )}

      {isLoading && <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div>}

      {audit && (
        <>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18, fontSize: 13 }}>
            <div><span style={{ color: '#6b7280' }}>Assessed</span> <span style={{ fontWeight: 600 }}>{audit.assessed}</span></div>
            <div><span style={{ color: '#6b7280' }}>Answered the voluntary survey</span> <span style={{ fontWeight: 600 }}>{audit.responseRate}%</span></div>
            <div><span style={{ color: '#6b7280' }}>Groups flagged</span> <span style={{ fontWeight: 600, color: flagged ? RED : '#111827' }}>{flagged}</span></div>
          </div>

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

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: '1px solid #f3f4f6', paddingTop: 14, marginTop: 4 }}>
            <Lock size={14} style={{ color: '#9ca3af', marginTop: 2 }} />
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
              An internal early-warning tool, not a compliance determination. Groups under 30 are not scored.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
