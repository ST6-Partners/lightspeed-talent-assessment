import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Pencil, Send } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  'Pending Approval': 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-blue-100 text-blue-700',
  Open: 'bg-green-100 text-green-700',
  'On Hold': 'bg-orange-100 text-orange-700',
  Closed: 'bg-red-100 text-red-700',
};

const DEPARTMENTS = ['Engineering', 'Product', 'Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'Customer Success', 'Legal', 'Other'];
const REASONS = [
  { v: 'backfill', l: 'Backfill (same role)' },
  { v: 'new_headcount', l: 'New headcount' },
  { v: 'replacement_diff', l: 'Replacement — different profile' },
  { v: 'termination_diff', l: 'Termination — different profile' },
];
const COMP_BASIS = [{ v: 'budget', l: 'Budget' }, { v: 'market', l: 'Market data' }, { v: 'philosophy', l: 'Pay philosophy' }];

interface Round { roundName: string; lengthMin?: number; format?: string; }
interface Person { personRef: string; roleInProcess?: string; roundRef?: string; }
interface Aware { personRef: string; source: 'auto' | 'manual'; }

const EMPTY = {
  reasonType: '', roleChangeNote: '',
  department: '', hiringManager: '', numOpenings: 1, priority: 'Medium',
  employmentType: 'Full-Time', location: '', workArrangement: 'On-site', hybridDays: '',
  salaryMin: '', salaryMax: '', compBasis: [] as string[], variableComp: '',
  interviewRounds: 1, questionSource: 'standard',
  teamAvailabilityConfirmed: false,
  timelineTemplate: 'standard', targetPostDate: '', targetOfferDate: '',
};

const lbl = 'block text-xs font-medium text-gray-600 mb-1';
const inp = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan';

export default function Intake() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [rounds, setRounds] = useState<Round[]>([]);
  const [team, setTeam] = useState<Person[]>([]);
  const [awareness, setAwareness] = useState<Aware[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: intakes, refetch } = trpc.intake.list.useQuery();
  const { data: full } = trpc.intake.get.useQuery({ id: editingId! }, { enabled: !!editingId });

  useEffect(() => {
    if (full && editingId) {
      const f: any = full;
      setForm({
        reasonType: f.reasonType ?? '', roleChangeNote: f.roleChangeNote ?? '',
        department: f.department ?? '', hiringManager: f.hiringManager ?? '',
        numOpenings: f.numOpenings ?? 1, priority: f.priority ?? 'Medium',
        employmentType: f.employmentType ?? 'Full-Time', location: f.location ?? '',
        workArrangement: f.workArrangement ?? 'On-site', hybridDays: f.hybridDays != null ? String(f.hybridDays) : '',
        salaryMin: f.salaryMin != null ? String(f.salaryMin) : '', salaryMax: f.salaryMax != null ? String(f.salaryMax) : '',
        compBasis: Array.isArray(f.compBasis) ? f.compBasis : [], variableComp: f.variableComp ?? '',
        interviewRounds: f.interviewRounds ?? 1, questionSource: f.questionSource ?? 'standard',
        teamAvailabilityConfirmed: !!f.teamAvailabilityConfirmed,
        timelineTemplate: f.timelineTemplate ?? 'standard',
        targetPostDate: f.targetPostDate ?? '', targetOfferDate: f.targetOfferDate ?? '',
      });
      setRounds(f.rounds?.map((r: any) => ({ roundName: r.roundName, lengthMin: r.lengthMin ?? undefined, format: r.format ?? undefined })) ?? []);
      setTeam(f.team?.map((p: any) => ({ personRef: p.personRef, roleInProcess: p.roleInProcess ?? undefined, roundRef: p.roundRef ?? undefined })) ?? []);
      setAwareness(f.awareness?.map((a: any) => ({ personRef: a.personRef, source: a.source })) ?? []);
    }
  }, [full, editingId]);

  const close = () => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY }); setRounds([]); setTeam([]); setAwareness([]); setErr(null); setSaved(false); };
  const startCreate = () => { close(); setShowForm(true); };
  const startEdit = (r: any) => { setErr(null); setEditingId(r.id); setShowForm(true); };

  const saveMutation = trpc.intake.saveDraft.useMutation({
    onSuccess: (data) => {
      refetch();
      setErr(null);
      setSaved(true);
      if (!editingId) setEditingId(data.id); // keep editing the same draft; avoids duplicates
    },
    onError: (e) => { setErr(e.message); setSaved(false); },
  });
  const submitMutation = trpc.intake.submit.useMutation({
    onSuccess: () => { refetch(); close(); },
    onError: (e) => setErr(e.message),
  });

  const buildPayload = () => ({
    ...(editingId ? { id: editingId } : {}),
    reasonType: form.reasonType ? (form.reasonType as any) : undefined,
    roleChangeNote: form.roleChangeNote || undefined,
    department: form.department, hiringManager: form.hiringManager,
    numOpenings: Number(form.numOpenings) || 1, priority: form.priority as any,
    employmentType: form.employmentType as any, location: form.location || undefined,
    workArrangement: form.workArrangement as any,
    hybridDays: form.workArrangement === 'Hybrid' && form.hybridDays ? parseInt(form.hybridDays) : undefined,
    salaryMin: form.salaryMin ? parseInt(form.salaryMin) : undefined,
    salaryMax: form.salaryMax ? parseInt(form.salaryMax) : undefined,
    compBasis: form.compBasis as any, variableComp: form.variableComp || undefined,
    interviewRounds: Number(form.interviewRounds) || 1, questionSource: form.questionSource as any,
    teamAvailabilityConfirmed: form.teamAvailabilityConfirmed,
    timelineTemplate: form.timelineTemplate as any,
    targetPostDate: form.targetPostDate || undefined, targetOfferDate: form.targetOfferDate || undefined,
    rounds: rounds.filter((r) => r.roundName),
    team: team.filter((p) => p.personRef),
    awareness: awareness.filter((a) => a.personRef),
  });

  const handleSave = () => { setErr(null); setSaved(false); if (!form.department || !form.hiringManager) { setErr('Department and hiring manager are required.'); return; } saveMutation.mutate(buildPayload() as any); };
  const handleSubmit = async () => {
    setErr(null);
    if (!form.department || !form.hiringManager) { setErr('Department and hiring manager are required.'); return; }
    const saved = await saveMutation.mutateAsync(buildPayload() as any);
    submitMutation.mutate({ id: saved.id });
  };
  const toggleBasis = (v: string) => setForm({ ...form, compBasis: form.compBasis.includes(v) ? form.compBasis.filter((x) => x !== v) : [...form.compBasis, v] });
  const saving = saveMutation.isLoading || submitMutation.isLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intake</h1>
          <p className="text-gray-500 text-sm mt-1">Open a role: define it, route it for approval, kick off the search.</p>
        </div>
        <button onClick={() => (showForm ? close() : startCreate())} className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600">
          <Plus size={16} /> New Intake
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{editingId ? 'Edit Intake' : 'New Intake'}</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          {/* 1 — Why */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">1 · Why we're opening this role</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Reason</label>
                <select value={form.reasonType} onChange={(e) => setForm({ ...form, reasonType: e.target.value })} className={inp}>
                  <option value="">Select reason</option>
                  {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>How the role should differ (optional)</label>
                <input type="text" value={form.roleChangeNote} onChange={(e) => setForm({ ...form, roleChangeNote: e.target.value })} placeholder="e.g. was senior, now hiring junior" className={inp} />
              </div>
            </div>
          </section>

          {/* 2 — Role */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">2 · The role</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Department *</label>
                <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inp}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Hiring Manager *</label>
                <input type="text" value={form.hiringManager} onChange={(e) => setForm({ ...form, hiringManager: e.target.value })} placeholder="e.g. Wes Anderson" className={inp} />
              </div>
              <div>
                <label className={lbl}>Number of Openings</label>
                <input type="number" min={1} value={form.numOpenings} onChange={(e) => setForm({ ...form, numOpenings: parseInt(e.target.value) || 1 })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inp}>
                  {['Low', 'Medium', 'High', 'Critical'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 3 — Employment & location */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">3 · Employment &amp; location</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Employment Type</label>
                <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className={inp}>
                  {['Full-Time', 'Part-Time', 'Contract', 'Internship'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Location</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Austin, TX" className={inp} />
              </div>
              <div>
                <label className={lbl}>Work Arrangement</label>
                <select value={form.workArrangement} onChange={(e) => setForm({ ...form, workArrangement: e.target.value })} className={inp}>
                  {['On-site', 'Hybrid', 'Remote'].map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              {form.workArrangement === 'Hybrid' && (
                <div>
                  <label className={lbl}>Days in office</label>
                  <input type="number" min={0} max={5} value={form.hybridDays} onChange={(e) => setForm({ ...form, hybridDays: e.target.value })} className={inp} />
                </div>
              )}
            </div>
          </section>

          {/* 4 — Compensation */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">4 · Compensation</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Salary Min ($)</label>
                <input type="number" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} placeholder="80000" className={inp} />
              </div>
              <div>
                <label className={lbl}>Salary Max ($)</label>
                <input type="number" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} placeholder="120000" className={inp} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Basis for the range</label>
                <div className="flex gap-4">
                  {COMP_BASIS.map((c) => (
                    <label key={c.v} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={form.compBasis.includes(c.v)} onChange={() => toggleBasis(c.v)} className="rounded" /> {c.l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className={lbl}>Bonus / variable comp (optional)</label>
                <input type="text" value={form.variableComp} onChange={(e) => setForm({ ...form, variableComp: e.target.value })} placeholder="e.g. 15% target bonus, or $20k OTE" className={inp} />
              </div>
            </div>
          </section>

          {/* 5 — Interview structure */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">5 · Interview structure</h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className={lbl}>Number of rounds</label>
                <input type="number" min={1} max={5} value={form.interviewRounds} onChange={(e) => setForm({ ...form, interviewRounds: parseInt(e.target.value) || 1 })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Interview questions</label>
                <select value={form.questionSource} onChange={(e) => setForm({ ...form, questionSource: e.target.value })} className={inp}>
                  <option value="standard">Reuse standard set</option>
                  <option value="ai_generate">AI-generate (changed/new JD)</option>
                </select>
              </div>
            </div>
            <label className={lbl}>Rounds</label>
            {rounds.map((r, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={r.roundName} onChange={(e) => setRounds(rounds.map((x, j) => j === i ? { ...x, roundName: e.target.value } : x))} placeholder="Round name (e.g. Phone screen)" className={inp} />
                <input type="number" value={r.lengthMin ?? ''} onChange={(e) => setRounds(rounds.map((x, j) => j === i ? { ...x, lengthMin: e.target.value ? parseInt(e.target.value) : undefined } : x))} placeholder="min" className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                <input value={r.format ?? ''} onChange={(e) => setRounds(rounds.map((x, j) => j === i ? { ...x, format: e.target.value } : x))} placeholder="format (HR / panel)" className={inp} />
                <button onClick={() => setRounds(rounds.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
            <button onClick={() => setRounds([...rounds, { roundName: '' }])} className="text-sm text-ls-primary hover:underline">+ Add round</button>
          </section>

          {/* 6 — Team & awareness */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">6 · Hiring team &amp; awareness</h3>
            <label className={lbl}>Interview team</label>
            {team.map((p, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={p.personRef} onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, personRef: e.target.value } : x))} placeholder="Name" className={inp} />
                <input value={p.roleInProcess ?? ''} onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, roleInProcess: e.target.value } : x))} placeholder="Role (e.g. panelist)" className={inp} />
                <input value={p.roundRef ?? ''} onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, roundRef: e.target.value } : x))} placeholder="Round" className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                <button onClick={() => setTeam(team.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
            <button onClick={() => setTeam([...team, { personRef: '' }])} className="text-sm text-ls-primary hover:underline">+ Add team member</button>

            <label className={`${lbl} mt-4`}>Awareness list (notified, not approvers)</label>
            {awareness.map((a, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={a.personRef} onChange={(e) => setAwareness(awareness.map((x, j) => j === i ? { ...x, personRef: e.target.value } : x))} placeholder="Name (e.g. ELT leader)" className={inp} />
                <button onClick={() => setAwareness(awareness.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
            <button onClick={() => setAwareness([...awareness, { personRef: '', source: 'manual' }])} className="text-sm text-ls-primary hover:underline">+ Add to awareness list</button>

            <div className="mt-4 flex items-center gap-2">
              <input type="checkbox" id="avail" checked={form.teamAvailabilityConfirmed} onChange={(e) => setForm({ ...form, teamAvailabilityConfirmed: e.target.checked })} className="rounded" />
              <label htmlFor="avail" className="text-sm text-gray-700">The hiring team is available within the target window (required to submit)</label>
            </div>
          </section>

          {/* 7 — Timeline */}
          <section>
            <h3 className="text-sm font-semibold text-ls-primary mb-2">7 · Timeline</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Timeline template</label>
                <select value={form.timelineTemplate} onChange={(e) => setForm({ ...form, timelineTemplate: e.target.value })} className={inp}>
                  <option value="standard">Standard (~4 wks to offer)</option>
                  <option value="senior">Senior / non-standard (~6–8 wks)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Target post date</label>
                <input type="date" value={form.targetPostDate} onChange={(e) => setForm({ ...form, targetPostDate: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Target offer date</label>
                <input type="date" value={form.targetOfferDate} onChange={(e) => setForm({ ...form, targetOfferDate: e.target.value })} className={inp} />
              </div>
            </div>
          </section>

          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">Couldn't save: {err}</div>}
          {saved && !err && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">Draft saved ✓ — it's in the list below and will still be here when you come back.</div>}

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-white border border-ls-primary text-ls-primary rounded-md text-sm font-medium hover:bg-ls-bg-2 disabled:opacity-50">
              {saveMutation.isLoading ? 'Saving...' : 'Save draft'}
            </button>
            <button onClick={handleSubmit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
              <Send size={15} /> {submitMutation.isLoading ? 'Submitting...' : 'Submit for approval'}
            </button>
            <button onClick={close} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!intakes || intakes.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No intakes yet. Create one to open a role.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Hiring Manager</th>
                <th className="px-4 py-3">Openings</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {intakes.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.department}</td>
                  <td className="px-4 py-3 text-gray-600">{r.hiringManager}</td>
                  <td className="px-4 py-3 text-gray-600">{r.numOpenings}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[r.status] ?? ''}`}>{r.status}</span></td>
                  <td className="px-4 py-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(r)} className="p-1 text-gray-400 hover:text-ls-primary" title="Edit"><Pencil size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
