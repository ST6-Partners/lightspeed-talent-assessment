import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { trpc } from '../lib/trpc';

const SEX = ['Male', 'Female', 'Non-binary', 'Declined'];
const RACE = [
  'Hispanic or Latino',
  'White',
  'Black or African American',
  'Asian',
  'Native American or Alaska Native',
  'Native Hawaiian or Pacific Islander',
  'Two or more races',
  'Declined',
];
const VET = ['Protected veteran', 'Not a protected veteran', 'Declined'];
const DIS = ['Yes', 'No', 'Declined'];

// 'Declined' renders as this friendlier label.
const PREFER_NOT = 'Prefer not to say';
const label = (v: string) => (v === 'Declined' ? PREFER_NOT : v);

export default function EeoSurvey() {
  const { token = '' } = useParams();
  const [sex, setSex] = useState<string>('');
  const [raceEthnicity, setRace] = useState<string>('');
  const [veteranStatus, setVet] = useState<string>('');
  const [disabilityStatus, setDis] = useState<string>('');
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = trpc.eeo.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );

  const submit = trpc.eeo.submit.useMutation({ onSuccess: () => setDone(true) });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-ls-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <svg width="30" height="30" viewBox="0 0 40 40" fill="none" stroke="#4FA9D6" strokeWidth="3.6" strokeLinecap="round">
            <path d="M11 8 a8.5 8.5 0 0 1 8.5 8.5 v7 a8.5 8.5 0 0 0 8.5 8.5" />
            <path d="M29 8 a8.5 8.5 0 0 0 -8.5 8.5 v7 a8.5 8.5 0 0 1 -8.5 8.5" />
            <line x1="5" y1="14" x2="11.5" y2="14" />
            <line x1="28.5" y1="26" x2="35" y2="26" />
          </svg>
          <div className="leading-tight">
            <div className="font-bold text-[15px] text-gray-900">Lightspeed</div>
            <div className="text-[11px] text-gray-500">Talent Assessment</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );

  const Field = ({ title, options, value, onChange }: {
    title: string; options: string[]; value: string; onChange: (v: string) => void;
  }) => (
    <div className="mb-5">
      <div className="text-sm font-medium text-gray-900 mb-2">{title}</div>
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name={title} checked={value === o} onChange={() => onChange(o)} />
            {label(o)}
          </label>
        ))}
      </div>
    </div>
  );

  if (isLoading) {
    return <Shell><div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">Loading…</div></Shell>;
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Link not found</h1>
          <p className="text-sm text-gray-500">This survey link is invalid or has expired.</p>
        </div>
      </Shell>
    );
  }

  if (done || data.alreadySubmitted) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Thank you</h1>
          <p className="text-sm text-gray-500">Your response has been recorded. This has no effect on your candidacy.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Voluntary self-identification</h1>
        <div className="flex items-start gap-2 bg-blue-50 text-blue-900 text-[13px] rounded-md p-3 mb-6 leading-relaxed">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <span>
            Answering is completely voluntary. Your responses are confidential, are used only in
            aggregate to monitor equal-opportunity hiring, and will <strong>not</strong> be shared with
            the hiring team or affect your candidacy in any way. You may skip any question or choose
            “{PREFER_NOT}”.
          </span>
        </div>

        <Field title="Sex" options={SEX} value={sex} onChange={setSex} />
        <Field title="Race / ethnicity" options={RACE} value={raceEthnicity} onChange={setRace} />
        <Field title="Protected veteran status" options={VET} value={veteranStatus} onChange={setVet} />
        <Field title="Disability status" options={DIS} value={disabilityStatus} onChange={setDis} />

        {submit.error && (
          <div className="text-sm text-red-600 mb-3">Something went wrong. Please try again.</div>
        )}

        <div className="flex items-center gap-3">
          <button
            className="px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
            disabled={submit.isLoading}
            onClick={() => submit.mutate({
              token,
              sex: (sex || undefined) as any,
              raceEthnicity: (raceEthnicity || undefined) as any,
              veteranStatus: (veteranStatus || undefined) as any,
              disabilityStatus: (disabilityStatus || undefined) as any,
            })}
          >
            {submit.isLoading ? 'Submitting…' : 'Submit'}
          </button>
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            disabled={submit.isLoading}
            onClick={() => submit.mutate({ token })}
          >
            Skip all / prefer not to answer
          </button>
        </div>
      </div>
    </Shell>
  );
}
