import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../../lib/trpc';

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#4FA9D6" strokeWidth="3.6" strokeLinecap="round">
      <path d="M11 8 a8.5 8.5 0 0 1 8.5 8.5 v7 a8.5 8.5 0 0 0 8.5 8.5" />
      <path d="M29 8 a8.5 8.5 0 0 0 -8.5 8.5 v7 a8.5 8.5 0 0 1 -8.5 8.5" />
      <line x1="5" y1="14" x2="11.5" y2="14" />
      <line x1="28.5" y1="26" x2="35" y2="26" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ls-bg flex flex-col items-center py-10 px-4">
      <div className="flex items-center gap-3 mb-8">
        <BrandMark />
        <div className="leading-tight">
          <div className="text-gray-900 font-bold text-[15px] tracking-tight">Lightspeed</div>
          <div className="text-[11px] text-gray-500">Talent Assessment</div>
        </div>
      </div>
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">{children}</div>;
}

function fmtClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtCountdownLong(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function CandidateSession() {
  const { token } = useParams<{ token: string }>();
  const query = trpc.sessions.getByToken.useQuery({ token: token ?? '' }, { enabled: !!token });
  const { data, refetch, isLoading, error } = query;

  // Clock-skew correction: offset = serverNow - clientNow captured on load.
  const offsetRef = useRef<number | null>(null);
  useEffect(() => {
    if (data?.serverNow && offsetRef.current === null) {
      offsetRef.current = Date.parse(data.serverNow) - Date.now();
    }
  }, [data?.serverNow]);
  const serverAdjustedNow = () => Date.now() + (offsetRef.current ?? 0);

  // Tick every second to drive live countdowns.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const startMutation = trpc.sessions.start.useMutation({ onSuccess: () => refetch() });
  const submitMutation = trpc.sessions.submit.useMutation({ onSuccess: () => refetch() });

  const [generalResponse, setGeneralResponse] = useState('');
  const [generalShowWork, setGeneralShowWork] = useState('');
  const [functionalResponse, setFunctionalResponse] = useState('');
  const [functionalShowWork, setFunctionalShowWork] = useState('');
  const autoSubmittedRef = useRef(false);

  // Prefill any saved in-progress responses.
  useEffect(() => {
    if (data?.session?.status === 'in_progress') {
      setGeneralResponse((v) => v || data.session.generalResponse || '');
      setGeneralShowWork((v) => v || data.session.generalShowWork || '');
      setFunctionalResponse((v) => v || data.session.functionalResponse || '');
      setFunctionalShowWork((v) => v || data.session.functionalShowWork || '');
    }
  }, [data?.session?.status]);

  const doSubmit = () => {
    if (!token) return;
    submitMutation.mutate({ token, generalResponse, generalShowWork, functionalResponse, functionalShowWork });
  };

  const dueAtMs = data?.session?.dueAt ? new Date(data.session.dueAt).getTime() : null;
  const remaining = dueAtMs != null ? dueAtMs - serverAdjustedNow() : null;
  const timeUp = remaining != null && remaining <= 0;

  // Auto-submit once when time runs out during an in-progress session.
  useEffect(() => {
    if (data?.session?.status === 'in_progress' && timeUp && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      doSubmit();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) return <Shell><Card><p className="text-sm text-gray-600">Invalid assessment link.</p></Card></Shell>;
  if (isLoading) return <Shell><Card><p className="text-sm text-gray-500">Loading…</p></Card></Shell>;
  if (error || !data) return <Shell><Card><p className="text-sm text-gray-600">We couldn't find this assessment. Please check your link.</p></Card></Shell>;

  const { session, package: pkg, generalTask, functionalTask } = data;
  if (!pkg) return <Shell><Card><p className="text-sm text-gray-600">This assessment isn't set up correctly. Please contact the recruiter.</p></Card></Shell>;
  const scheduledStartMs = session.scheduledStart ? new Date(session.scheduledStart).getTime() : null;
  const beforeScheduled =
    session.status === 'scheduled' &&
    pkg.deliveryMode === 'scheduled' &&
    scheduledStartMs != null &&
    serverAdjustedNow() < scheduledStartMs;

  // ---- scheduled: locked, awaiting unlock ----
  if (beforeScheduled) {
    const untilStart = scheduledStartMs! - serverAdjustedNow();
    return (
      <Shell>
        <Card>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Your assessment is locked</h1>
          <p className="text-sm text-gray-600">
            Your assessment unlocks at <span className="font-semibold text-gray-900">{new Date(scheduledStartMs!).toLocaleString()}</span>.
          </p>
          <div className="mt-5 flex flex-col items-center py-4">
            <div className="text-3xl font-bold text-ls-primary tabular-nums">{fmtCountdownLong(untilStart)}</div>
            <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">until unlock</div>
          </div>
        </Card>
      </Shell>
    );
  }

  // ---- scheduled: ready to start (open mode, or scheduled time reached) ----
  if (session.status === 'scheduled') {
    return (
      <Shell>
        <Card>
          <h1 className="text-xl font-bold text-gray-900 mb-3">You're ready to begin</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            You'll have <span className="font-semibold text-gray-900">{pkg.windowMinutes} minutes</span> once you begin.
            You may use any AI tools. You'll be asked to show your work.
          </p>
          <button
            onClick={() => token && startMutation.mutate({ token })}
            disabled={startMutation.isLoading}
            className="mt-5 px-5 py-2.5 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {startMutation.isLoading ? 'Starting…' : 'Start assessment'}
          </button>
        </Card>
      </Shell>
    );
  }

  // ---- unlocked but somehow still displayed as locked scheduled after countdown ----
  // (handled above; scheduled with reached time falls through to the ready screen)

  // ---- in_progress ----
  if (session.status === 'in_progress') {
    const disabled = timeUp || submitMutation.isLoading;
    return (
      <Shell>
        <div className="sticky top-0 z-10 -mx-4 px-4 mb-4">
          <div className={`rounded-lg border px-4 py-3 flex items-center justify-between shadow-sm ${timeUp ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
            <div className="text-sm font-medium text-gray-700">Time remaining</div>
            <div className={`text-2xl font-bold tabular-nums ${timeUp ? 'text-gray-500' : 'text-ls-primary'}`}>
              {timeUp ? "Time's up" : fmtClock(remaining ?? 0)}
            </div>
          </div>
        </div>

        {generalTask && (
          <Card>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1">General task</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">{generalTask.title}</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap mb-4">{generalTask.brief}</p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your response</label>
            <textarea value={generalResponse} disabled={disabled} rows={6}
              onChange={(e) => setGeneralResponse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan disabled:bg-gray-50 disabled:text-gray-400 mb-4" />
            {generalTask.showYourWorkInstructions && (
              <p className="text-xs text-gray-500 mb-1"><span className="font-semibold text-gray-600">Show your work: </span>{generalTask.showYourWorkInstructions}</p>
            )}
            <label className="block text-xs font-medium text-gray-600 mb-1">Show your work</label>
            <textarea value={generalShowWork} disabled={disabled} rows={4}
              onChange={(e) => setGeneralShowWork(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan disabled:bg-gray-50 disabled:text-gray-400" />
          </Card>
        )}

        {functionalTask && (
          <Card>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1">Functional task</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">{functionalTask.title}</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap mb-4">{functionalTask.brief}</p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your response</label>
            <textarea value={functionalResponse} disabled={disabled} rows={6}
              onChange={(e) => setFunctionalResponse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan disabled:bg-gray-50 disabled:text-gray-400 mb-4" />
            {functionalTask.showYourWorkInstructions && (
              <p className="text-xs text-gray-500 mb-1"><span className="font-semibold text-gray-600">Show your work: </span>{functionalTask.showYourWorkInstructions}</p>
            )}
            <label className="block text-xs font-medium text-gray-600 mb-1">Show your work</label>
            <textarea value={functionalShowWork} disabled={disabled} rows={4}
              onChange={(e) => setFunctionalShowWork(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan disabled:bg-gray-50 disabled:text-gray-400" />
          </Card>
        )}

        <div className="flex items-center gap-3 mb-8">
          <button onClick={doSubmit} disabled={disabled}
            className="px-5 py-2.5 bg-ls-primary text-white rounded-lg text-sm font-medium hover:bg-ls-primary-600 disabled:opacity-50">
            {submitMutation.isLoading ? 'Submitting…' : 'Submit assessment'}
          </button>
          {timeUp && <span className="text-sm text-gray-500">Time's up — your work is being submitted.</span>}
        </div>
      </Shell>
    );
  }

  // ---- submitted ----
  if (session.status === 'submitted') {
    return (
      <Shell>
        <Card>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Thanks — your assessment has been submitted.</h1>
          <p className="text-sm text-gray-600">We've received your responses. You can close this window.</p>
        </Card>
      </Shell>
    );
  }

  // ---- expired ----
  if (session.status === 'expired') {
    return (
      <Shell>
        <Card>
          <h1 className="text-xl font-bold text-gray-900 mb-2">This session has expired</h1>
          <p className="text-sm text-gray-600">The time window for this assessment has passed. Please contact your recruiter if you have questions.</p>
        </Card>
      </Shell>
    );
  }

  return <Shell><Card><p className="text-sm text-gray-600">Unknown session state.</p></Card></Shell>;
}
