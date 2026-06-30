import { Wrench } from 'lucide-react';

export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-10 text-center">
      <Wrench className="mx-auto mb-3 text-gray-300" size={28} />
      <h2 className="font-semibold text-gray-700">{title}</h2>
      <p className="text-sm text-gray-400 mt-1">{note ?? 'Coming soon.'}</p>
    </div>
  );
}
