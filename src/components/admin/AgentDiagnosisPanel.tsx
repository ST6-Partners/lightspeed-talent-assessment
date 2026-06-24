// ============================================================
// AGENT DIAGNOSIS PANEL — the admin "AI queue" cockpit (Signal parity)
//
// Renders the propose-and-approve agent's diagnosis for a pm_review /
// approved / agent-resolved item. Mirrors Signal's FeedbackAdmin agent
// section: confidence + tier, summary, recommended fix, reclassification,
// confidence-signal breakdown, pipeline status, root cause / fix / commit
// / deployment, and a "Review PR" link. Diagnosis is read from the
// admin_notes JSON string (Contract v1.0 §3.4), with agentDiagnosis as a
// fallback. Presentational — the parent owns the Approve/Dismiss/Re-open.
// ============================================================

interface Props {
  adminNotes?: string | null;
  agentDiagnosis?: any;
  agentStatus?: string | null;
  agentPrUrl?: string | null;
}

const TIER_COLOR: Record<string, string> = {
  'Auto-Fix': 'bg-green-100 text-green-800',
  'Assisted': 'bg-yellow-100 text-yellow-800',
  'Manual': 'bg-gray-100 text-gray-700',
};

function Stat({ ok, label, detail }: { ok: string; label: string; detail?: string }) {
  const color = ok === 'passed' ? 'text-green-700' : ok === 'failed' ? 'text-red-700' : 'text-gray-400';
  const mark = ok === 'passed' ? '✓' : ok === 'failed' ? '✗' : '—';
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`${color} font-semibold`}>{mark}</span>
      <span className="text-gray-600"><span className="font-medium">{label}:</span> {detail || ok}</span>
    </div>
  );
}

export default function AgentDiagnosisPanel({ adminNotes, agentDiagnosis, agentStatus, agentPrUrl }: Props) {
  let d: any = agentDiagnosis ?? null;
  if (adminNotes) {
    try { d = typeof adminNotes === 'string' ? JSON.parse(adminNotes) : adminNotes; } catch { /* keep fallback */ }
  }
  if (!d || typeof d !== 'object') return null;

  const total = d?.confidence?.total;
  const tier = d?.confidence?.tier;
  const signals = d?.confidence?.signals;
  const pipeline = d?.pipeline;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
          Agent Diagnosis{agentStatus ? ` · ${agentStatus}` : ''}
        </div>
        <div className="flex items-center gap-2">
          {typeof total === 'number' && (
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-white border border-amber-200 text-amber-900">
              {total}/12
            </span>
          )}
          {tier && (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${TIER_COLOR[tier] ?? 'bg-gray-100 text-gray-700'}`}>
              {tier}
            </span>
          )}
        </div>
      </div>

      {d.diagnosis_summary && (
        <p className="text-sm text-gray-800">{d.diagnosis_summary}</p>
      )}

      {d.recommended_fix && (
        <div className="rounded-md bg-white border-l-4 border-amber-400 px-3 py-2">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Recommended fix</div>
          <div className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{d.recommended_fix}</div>
        </div>
      )}

      {d.reclassification && (
        <div className="text-xs text-gray-600">
          <span className="font-medium">Reclassified:</span>{' '}
          {d.reclassification.from ? <><strong>{d.reclassification.from}</strong> → bug candidate</> : 'bug candidate'}
          {typeof d.reclassification.indicators_matched === 'number' && (
            <> · matched {d.reclassification.indicators_matched} indicators{d.reclassification.detail ? `: ${d.reclassification.detail}` : ''}</>
          )}
        </div>
      )}

      {signals && (
        <div className="rounded-md bg-white border border-amber-100 p-2.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Confidence signals</div>
          <div className="space-y-1">
            {Object.entries(signals).map(([k, sig]: [string, any]) => (
              <div key={k} className="flex items-start gap-2 text-xs">
                <span className="font-mono font-semibold text-amber-800">{sig?.score}/3</span>
                <span className="text-gray-600"><span className="font-medium">{k.replace(/_/g, ' ')}:</span> {sig?.rationale}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pipeline && (
        <div className="rounded-md bg-white border border-amber-100 p-2.5 space-y-1">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Verification</div>
          {['code_audit', 'smoke_test', 'spot_check'].map((step) => pipeline[step] && (
            <Stat key={step} ok={pipeline[step].status} label={step.replace(/_/g, ' ')} detail={pipeline[step].detail} />
          ))}
        </div>
      )}

      {(d.root_cause || d.fix_category || d.commit || d.deployment) && (
        <div className="text-xs text-gray-600 space-y-1">
          {d.root_cause && <div><span className="font-medium">Root cause:</span> {d.root_cause}</div>}
          {d.fix_category && <div><span className="font-medium">Category:</span> {d.fix_category}</div>}
          {d.commit && <div><span className="font-medium">Commit:</span> <span className="font-mono">{d.commit}</span></div>}
          {d.deployment?.dev && <div><span className="font-medium">Dev:</span> {d.deployment.dev.status === 'confirmed' ? '✅ live' : '⏳ pending'}</div>}
        </div>
      )}

      {agentPrUrl && (
        <a
          href={agentPrUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700"
        >
          Review PR ↗
        </a>
      )}
    </div>
  );
}
