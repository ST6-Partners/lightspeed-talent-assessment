import { useState } from 'react';
import { CheckCircle2, Calendar, PhoneCall } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function PhoneScreenConfirm({ token, firstName, jobTitle, availability }: {
  token: string;
  firstName: string;
  jobTitle: string | null;
  availability: string;
}) {
  const [state, setState] = useState<'choose' | 'confirmed' | 'declined'>('choose');

  const confirm = trpc.scheduling.confirmPhoneScreen.useMutation({ onSuccess: () => setState('confirmed') });
  const decline = trpc.scheduling.phoneScreenNoAvailability.useMutation({ onSuccess: () => setState('declined') });
  const busy = confirm.isLoading || decline.isLoading;

  if (state === 'confirmed') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
        <h1 className="font-semibold text-gray-900 mb-1">Thanks{firstName ? `, ${firstName}` : ''} — you're all set</h1>
        <p className="text-sm text-gray-500">
          We’ve let our recruiter know you can make one of these times{jobTitle ? ` for ${jobTitle}` : ''}. They’ll follow up with a calendar invite and call you at the number you provided.
        </p>
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <PhoneCall className="mx-auto mb-3 text-ls-primary" size={28} />
        <h1 className="font-semibold text-gray-900 mb-1">Thanks for letting us know</h1>
        <p className="text-sm text-gray-500">
          We’ve told our recruiter that these times don’t work. They’ll reach out to you directly to find a time that does.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <Calendar className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Confirm your phone screen{jobTitle ? ` — ${jobTitle}` : ''}</h1>
      <p className="text-gray-500 text-sm mt-1">
        Hi {firstName}, our recruiter is available at the times below. Confirm if one works for you — it’s a short call, no video or app needed. We’ll call the number you provided.
      </p>
      <div className="mt-4 mb-4 px-4 py-3 bg-ls-bg border border-gray-200 rounded-md text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
        {availability}
      </div>
      {(confirm.error || decline.error) && (
        <p className="text-xs text-red-600 mb-2">{(confirm.error || decline.error)?.message}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => confirm.mutate({ token })}
          disabled={busy}
          className="flex-1 px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {confirm.isLoading ? 'Confirming…' : 'One of these works — confirm'}
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
