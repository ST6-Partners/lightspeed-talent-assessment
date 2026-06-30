export default function SubTabs({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            active === t
              ? 'border-ls-primary text-ls-primary'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
