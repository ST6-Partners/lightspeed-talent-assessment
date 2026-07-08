import { useState, useRef, useEffect, useMemo } from 'react';

export type SearchOption = { value: string; label: string };

// A lightweight searchable dropdown (typeahead). Shows the selected label when
// closed; on focus it opens a filterable list. Keyboard: ↑/↓ to move, Enter to
// pick, Esc to close. No external dependency.
export default function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  emptyText = 'No matches',
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchOption[];
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => { setActive(0); }, [query, open]);

  const inp =
    'w-full px-3 py-2 border border-ls-line rounded-lg text-sm bg-white focus:outline-none focus:border-ls-cyan focus:ring-2 focus:ring-ls-primary-50 disabled:bg-ls-bg-2 disabled:text-ls-ink-3';

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        disabled={disabled}
        className={inp}
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => { if (!disabled) setOpen(true); }}
        onChange={(e) => { setOpen(true); setQuery(e.target.value); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (open && filtered[active]) pick(filtered[active].value); }
          else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
        }}
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-ls-line rounded-lg shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-ls-ink-3">{emptyText}</div>}
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={`block w-full text-left px-3 py-2 text-sm ${i === active ? 'bg-ls-primary-50 text-ls-primary' : 'text-ls-ink-2 hover:bg-ls-bg-2'} ${o.value === value ? 'font-semibold' : ''}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
