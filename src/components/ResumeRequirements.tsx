// Shows the resume-screen results as met / not-met bullets. Shared by the
// Candidates panel and the Review tab. `checks` come from the candidate's
// resumeRequirementChecks (persisted by the resume screen).
type Check = { requirement: string; met: boolean; evidence?: string };

export default function ResumeRequirements({ checks }: { checks: Check[] | null | undefined }) {
  if (!checks || checks.length === 0) return null;
  const metCount = checks.filter((c) => c.met).length;
  return (
    <div>
      <div className="font-semibold text-gray-700 mb-1">
        Resume vs required qualifications{' '}
        <span className="font-normal text-gray-500">({metCount}/{checks.length} met)</span>
      </div>
      <ul className="space-y-1">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-snug">
            <span className={c.met ? 'text-green-600 shrink-0' : 'text-red-600 shrink-0'}>{c.met ? '✓' : '✗'}</span>
            <span className="text-gray-800">
              {c.requirement}
              {!c.met && c.evidence ? <span className="text-gray-400"> — {c.evidence}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
