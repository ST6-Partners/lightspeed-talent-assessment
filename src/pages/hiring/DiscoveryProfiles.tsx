// ============================================================
// DISCOVERY PROFILES — the Assessments > Insights tab
// Pick a candidate, upload their Insights Discovery PDF; we
// store it, read the Colour Dynamics page, and show a mini
// view (conscious + less-conscious energies) with the full
// PDF embedded. Post-hire reference only (not a screening gate).
// ============================================================

import { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, AlertTriangle, RefreshCw, Cloud } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const ENERGY = [
  { key: 'blue',   pctKey: 'bluePct',   label: 'Cool Blue',       hex: '#1F6FB2' },
  { key: 'green',  pctKey: 'greenPct',  label: 'Earth Green',     hex: '#3A9B5C' },
  { key: 'yellow', pctKey: 'yellowPct', label: 'Sunshine Yellow', hex: '#F2C10E' },
  { key: 'red',    pctKey: 'redPct',    label: 'Fiery Red',       hex: '#D93B36' },
] as const;

type Energies = Record<string, number> | null | undefined;

function EnergyBars({ energies }: { energies: Energies }) {
  if (!energies) return <div className="text-xs text-ls-ink-3 py-2">No energy data parsed.</div>;
  return (
    <div className="space-y-2.5">
      {ENERGY.map((e) => {
        const raw = energies[e.key];
        const pct = energies[e.pctKey] ?? 0;
        return (
          <div key={e.key} className="flex items-center gap-3">
            <div className="w-32 flex-none text-sm text-ls-ink flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: e.hex }} />
              {e.label}
            </div>
            <div className="flex-1 h-2.5 rounded-full bg-ls-bg-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: e.hex }} />
            </div>
            <div className="w-20 flex-none text-right text-sm font-semibold text-ls-ink tabular-nums">
              {pct}% <span className="text-ls-ink-3 font-normal">({typeof raw === 'number' ? raw.toFixed(2) : '—'})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileDetail({ profileId }: { profileId: string }) {
  const { data: p, isLoading } = trpc.discoveryProfiles.get.useQuery({ id: profileId });
  if (isLoading) return <div className="text-sm text-ls-ink-3 p-5">Loading profile…</div>;
  if (!p) return <div className="text-sm text-ls-risk p-5">Profile not found.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
        <div className="text-xs uppercase tracking-wide text-ls-ink-3 font-medium">Conscious wheel position</div>
        <div className="text-lg font-bold text-ls-ink">
          {p.typeNumber != null ? `${p.typeNumber}: ` : ''}{p.typeName ?? '—'}
        </div>
        {(p.lcTypeNumber != null || p.lcTypeName) && (
          <div className="text-xs text-ls-ink-3 mt-0.5">
            Less conscious — {p.lcTypeNumber != null ? `${p.lcTypeNumber}: ` : ''}{p.lcTypeName ?? '—'}
          </div>
        )}
        {p.parseStatus !== 'ok' && (
          <div className="flex items-start gap-2 text-xs text-ls-watch bg-ls-watch-bg border border-ls-line rounded-lg p-2 mt-3">
            <AlertTriangle size={14} className="mt-0.5 flex-none" />
            <span>{p.parseError || 'Some fields could not be read automatically. The PDF is still stored below.'}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
          <div className="text-sm font-semibold text-ls-ink mb-3">Conscious energies</div>
          <EnergyBars energies={p.conscious as Energies} />
        </div>
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
          <div className="text-sm font-semibold text-ls-ink mb-3">Less-conscious energies</div>
          <EnergyBars energies={p.lessConscious as Energies} />
        </div>
      </div>

      {p.source === 'insights-api' ? (
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-4 flex items-center gap-2 text-sm text-ls-ink-3">
          <Cloud size={16} /> Synced automatically from the Insights API — no PDF report attached.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-ls-ink">Full report</span>
          <a href={`/api/insights-pdf/${p.id}`} target="_blank" rel="noreferrer" className="text-xs text-ls-primary hover:underline">Open in new tab ↗</a>
        </div>
        <object data={`/api/insights-pdf/${p.id}`} type="application/pdf" className="w-full h-[600px] rounded-lg border border-ls-line">
          <iframe src={`/api/insights-pdf/${p.id}`} title="Insights Discovery PDF" className="w-full h-[600px]" />
        </object>
      </div>
      )}
    </div>
  );
}

export default function DiscoveryProfiles() {
  const utils = trpc.useUtils();
  const [candidateId, setCandidateId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: candidates } = trpc.candidates.list.useQuery();
  const profilesQuery = trpc.discoveryProfiles.byCandidate.useQuery(
    { candidateId },
    { enabled: !!candidateId },
  );
  const deleteMut = trpc.discoveryProfiles.delete.useMutation({
    onSuccess: () => { profilesQuery.refetch(); setSelectedId(null); },
  });
  const { data: cfg } = trpc.discoveryProfiles.insightsConfigured.useQuery();
  const syncMut = trpc.discoveryProfiles.syncFromInsights.useMutation({
    onSuccess: (row: any) => { setError(null); profilesQuery.refetch(); if (row?.id) setSelectedId(row.id); },
    onError: (e: any) => setError(e.message),
  });

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch('/api/upload/insights-pdf', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/pdf',
          'x-filename': file.name,
          'x-candidate-id': candidateId,
        },
        body: file,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      await profilesQuery.refetch();
      if (json.profile?.id) setSelectedId(json.profile.id);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const profiles = profilesQuery.data ?? [];

  return (
    <div className="max-w-4xl">
      {/* Candidate picker */}
      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
        <select
          value={candidateId}
          onChange={(e) => { setCandidateId(e.target.value); setSelectedId(null); }}
          className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm bg-white focus:outline-none focus:border-ls-cyan focus:ring-2 focus:ring-ls-primary-50"
        >
          <option value="">Select a candidate…</option>
          {(candidates ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.currentStage}</option>
          ))}
        </select>
      </div>

      {!candidateId ? (
        <div className="bg-white rounded-xl border border-ls-line p-8 text-center text-ls-ink-3 text-sm">
          Pick a candidate to view or upload their Insights Discovery profile.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Upload */}
          <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ls-ink">Insights Discovery report</div>
                <p className="text-xs text-ls-ink-3 mt-0.5">Upload the PDF — we store it and read the Colour Dynamics page automatically.</p>
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              <div className="flex items-center gap-2">
                {cfg?.configured && (
                  <button
                    onClick={() => syncMut.mutate({ candidateId })}
                    disabled={syncMut.isPending}
                    className="flex items-center gap-2 border border-ls-primary text-ls-primary text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-ls-primary-50"
                    title="Pull this candidate's profile from the Insights API by email"
                  >
                    <RefreshCw size={16} className={syncMut.isPending ? 'animate-spin' : ''} />
                    {syncMut.isPending ? 'Syncing…' : 'Sync from Insights'}
                  </button>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-ls-primary text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-ls-primary-600"
                >
                  <UploadCloud size={16} />
                  {uploading ? 'Uploading & reading…' : 'Upload PDF'}
                </button>
              </div>
            </div>
            {error && <div className="text-xs text-ls-risk mt-2">{error}</div>}
          </div>

          {/* Profiles for this candidate */}
          {profiles.length === 0 ? (
            <div className="bg-white rounded-xl border border-ls-line p-8 text-center text-ls-ink-3 text-sm">
              No Insights Discovery profile on file yet. Upload one above.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p: any) => {
                  const active = p.id === selectedId || (selectedId === null && p.id === profiles[0].id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${active ? 'border-ls-primary bg-ls-primary-50 text-ls-primary' : 'border-ls-line text-ls-ink hover:bg-ls-bg-2'}`}
                    >
                      <FileText size={13} />
                      {p.typeNumber != null ? `${p.typeNumber}: ` : ''}{p.typeName ?? p.pdfFilename ?? 'Profile'}
                      {p.parseStatus !== 'ok' && <AlertTriangle size={12} className="text-ls-watch" />}
                      <Trash2
                        size={13}
                        className="text-ls-ink-3 hover:text-ls-risk"
                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete this profile?')) deleteMut.mutate({ id: p.id }); }}
                      />
                    </button>
                  );
                })}
              </div>
              <ProfileDetail profileId={selectedId ?? profiles[0].id} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
