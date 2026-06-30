// ============================================================
// DOCUMENT INDEX PANEL — live list of the module's design docs,
// read straight from Dropbox (always current). Admin-only.
// ============================================================

import { trpc } from '../../lib/trpc';

const c = {
  wrap: { maxWidth: 900 } as React.CSSProperties,
  group: { marginTop: 22 } as React.CSSProperties,
  gh: { fontSize: 12, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: '#6b7280', fontWeight: 700, margin: '0 0 8px' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  name: { fontWeight: 600, fontSize: 14, flex: 1, color: '#111827' } as React.CSSProperties,
  open: { fontSize: 12.5, fontWeight: 600, color: '#2563eb', background: '#eaf1ff', border: '1px solid #d3e2ff', borderRadius: 999, padding: '5px 14px', textDecoration: 'none' } as React.CSSProperties,
  banner: (ok: boolean) => ({ padding: '12px 16px', borderRadius: 8, fontSize: 13.5, marginBottom: 16, background: ok ? '#ecfdf5' : '#fffbeb', border: `1px solid ${ok ? '#a7f3d0' : '#fde68a'}`, color: ok ? '#065f46' : '#92400e' } as React.CSSProperties),
  code: { background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
  btn: { padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  sub: { fontSize: 12.5, color: '#6b7280', margin: '2px 0 14px' } as React.CSSProperties,
};

export default function DocumentIndexPanel() {
  const q = trpc.docIndex.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = q.data;

  return (
    <div style={c.wrap}>
      <div style={c.head}>
        <div>
          <p style={c.title}>Document Index</p>
          <p style={c.sub}>The latest version of each design document, read live from Dropbox.</p>
        </div>
        <button style={c.btn} onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {data && !data.configured && (
        <div style={c.banner(false)}>
          ⚠ Dropbox isn't connected yet, so documents can't be listed. Set{' '}
          <span style={c.code}>DROPBOX_APP_KEY</span>, <span style={c.code}>DROPBOX_APP_SECRET</span>, and{' '}
          <span style={c.code}>DROPBOX_REFRESH_TOKEN</span> in Railway (optionally{' '}
          <span style={c.code}>DROPBOX_DOCS_PATH</span>). These are the same credentials the Command Center uses.
        </div>
      )}

      {data && data.configured && data.error && (
        <div style={c.banner(false)}>⚠ Couldn't read from Dropbox: {data.error}</div>
      )}

      {q.isLoading && <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>}

      {data && data.configured && !data.error && data.groups.length === 0 && (
        <div style={{ color: '#6b7280', fontSize: 14 }}>No documents found in the module folders.</div>
      )}

      {data && data.groups.map((g) => (
        <div key={g.group} style={c.group}>
          <p style={c.gh}>{g.group}</p>
          <div style={c.card}>
            {g.items.map((it, i) => (
              <div key={it.path} style={{ ...c.row, borderBottom: i === g.items.length - 1 ? 'none' : c.row.borderBottom }}>
                <span style={c.name}>{it.name}</span>
                <a style={c.open} target="_blank" rel="noreferrer"
                   href={`/api/admin/doc-index/file?path=${encodeURIComponent(it.path)}`}>Open ↗</a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
