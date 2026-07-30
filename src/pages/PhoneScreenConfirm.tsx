import { useState } from 'react';
import { CheckCircle2, Calendar, PhoneCall } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function PhoneScreenConfirm({ token, firstName, jobTitle, slots }: {
  token: string;
  firstName: string;
  jobTitle: string | null;
  slots: string[];
}) {
  const [state, setState] = useState<'choose' | 'confirmed' | 'declined'>('choose');
  const [selected, setSelected] = useState<string | null>(null);

  const confirm = trpc.scheduling.confirmPhoneScreen.useMutation({ onSuccess: () => setState('confirmed') });
  const decline = trpc.scheduling.phoneScreenNoAvailability.useMutation({ onSuccess: () => setState('declined') });
  const busy = confirm.isLoading || decline.isLoading;

  if (state === 'confirmed') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
        <h1 className="font-semibold text-gray-900 mb-1">You're all set{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-sm text-gray-500">
          Your phone screen{jobTitle ? ` for ${jobTitle}` : ''} is confirmed for:
        </p>
        {selected && <div className="mt-3 inline-block px-4 py-2 rounded-md bg-green-50 border border-green-200 text-sm font-semibold text-green-700">{selected}</div>}
        <p className="text-sm text-gray-500 mt-3">Our recruiter will send a calendar invite and call you at the number you provided.</p>
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <PhoneCall className="mx-auto mb-3 text-ls-primary" size={28} />
        <h1 className="font-semibold text-gray-900 mb-1">Thanks for letting us know</h1>
        <p className="text-sm text-gray-500">
          We’ve told our recruiter that none of these times work. They’ll reach out to you directly to find one that does.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <Calendar className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Pick a time for your phone screen{jobTitle ? ` — ${jobTitle}` : ''}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-4">
        Hi {firstName}, choose the time below that works best for you. It’s a short call — no video or app needed, and we’ll call the number you provided.
      </p>

      <div className="space-y-2 mb-4">
        {slots.map((slot, i) => {
          const active = selected === slot;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(slot)}
              className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-md border text-sm transition-colors ${active ? 'border-ls-primary bg-ls-primary/5 ring-1 ring-ls-primary' : 'border-gray-200 hover:border-gray-400'}`}
            >
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${active ? 'border-ls-primary' : 'border-gray-300'}`}>
                {active && <span className="w-2 h-2 rounded-full bg-ls-primary" />}
              </span>
              <span className={active ? 'font-medium text-gray-900' : 'text-gray-700'}>{slot}</span>
            </button>
          );
        })}
      </div>

      {(confirm.error || decline.error) && (
        <p className="text-xs text-red-600 mb-2">{(confirm.error || decline.error)?.message}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => selected && confirm.mutate({ token, slot: selected })}
          disabled={busy || !selected}
          className="flex-1 px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {confirm.isLoading ? 'Confirming…' : selected ? 'Confirm this time' : 'Select a time above'}
        </button>
        <button
          onClick={() => decline.mutate({ token })}
          disabled={busy}
          className="flex-1 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          {decline.isLoading ? 'Sending…' : 'No availability in this window — contact recruiter'}
        </button>
      </div>
    </div>
  );
}
