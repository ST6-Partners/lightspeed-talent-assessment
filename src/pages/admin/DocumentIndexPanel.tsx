// ============================================================
// DOCUMENT INDEX PANEL — latest version of each design doc.
// Links open the docs hosted by the app. Admin-only.
// ============================================================

import { trpc } from '../../lib/trpc';

const c = {
  wrap: { maxWidth: 900 } as React.CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  sub: { fontSize: 12.5, color: '#6b7280', margin: '2px 0 14px' } as React.CSSProperties,
  group: { marginTop: 20 } as React.CSSProperties,
  gh: { fontSize: 12, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: '#6b7280', fontWeight: 700, margin: '0 0 8px' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  meta: { flex: 1, minWidth: 0 } as React.CSSProperties,
  name: { fontWeight: 600, fontSize: 14, color: '#111827' } as React.CSSProperties,
  desc: { fontSize: 12.5, color: '#6b7280', marginTop: 1 } as React.CSSProperties,
  open: { fontSize: 12.5, fontWeight: 600, color: '#2563eb', background: '#eaf1ff', border: '1px solid #d3e2ff', borderRadius: 999, padding: '5px 14px', textDecoration: 'none', whiteSpace: 'nowrap' as const },
};

export default function DocumentIndexPanel() {
  const q = trpc.docIndex.list.useQuery();
  const groups = q.data?.groups ?? [];

  return (
    <div style={c.wrap}>
      <div style={c.head}>
        <div>
          <p style={c.title}>Document Index</p>
          <p style={c.sub}>The latest version of each design document for this module.</p>
        </div>
      </div>

      {q.isLoading && <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>}

      {groups.map((g: any) => (
        <div key={g.group} style={c.group}>
          <p style={c.gh}>{g.group}</p>
          <div style={c.card}>
            {g.items.map((it: any, i: number) => (
              <div key={it.url} style={{ ...c.row, borderBottom: i === g.items.length - 1 ? 'none' : c.row.borderBottom }}>
                <div style={c.meta}>
                  <div style={c.name}>{it.name}</div>
                  <div style={c.desc}>{it.description}</div>
                </div>
                <a style={c.open} target="_blank" rel="noreferrer" href={it.url}>Open ↗</a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
