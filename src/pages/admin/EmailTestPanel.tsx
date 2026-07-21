// ============================================================
// EMAIL TEST PANEL — SendGrid send form + test inbox
// Admin-only. Send a test email; receive replies / simulated mail.
// ============================================================

import { useState, Fragment } from 'react';
import { trpc } from '../../lib/trpc';

const c = {
  wrap: { maxWidth: 920 } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18 } as React.CSSProperties,
  h: { fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px' } as React.CSSProperties,
  sub: { fontSize: 12, color: '#6b7280', margin: '0 0 14px' } as React.CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', margin: '10px 0 4px' } as React.CSSProperties,
  input: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, minHeight: 90, boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  btn: { padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', marginTop: 12 } as React.CSSProperties,
  btnGhost: { padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  msgOk: { padding: '8px 12px', borderRadius: 6, background: '#d1fae5', color: '#065f46', fontSize: 13, marginTop: 12 } as React.CSSProperties,
  msgWarn: { padding: '8px 12px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 13, marginTop: 12 } as React.CSSProperties,
  msgErr: { padding: '8px 12px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginTop: 12 } as React.CSSProperties,
  banner: (ok: boolean) => ({ padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, background: ok ? '#ecfdf5' : '#fffbeb', border: `1px solid ${ok ? '#a7f3d0' : '#fde68a'}`, color: ok ? '#065f46' : '#92400e' } as React.CSSProperties),
  th: { textAlign: 'left' as const, padding: '7px 10px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const },
  td: { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12.5, verticalAlign: 'top' as const },
  tdEllipsis: { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12.5, verticalAlign: 'top' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' as const } as React.CSSProperties,
  code: { background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' },
};

function fmt(ts: string | Date | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function EmailTestPanel() {
  const cfg = trpc.emailTest.config.useQuery();
  const inbox = trpc.emailTest.listInbound.useQuery(undefined, { refetchInterval: 5000 });
  const outbox = trpc.emailTest.listOutbox.useQuery(undefined, { refetchInterval: 5000 });
  const clearOutbox = trpc.emailTest.clearOutbox.useMutation({ onSuccess: () => outbox.refetch() });
  const [openOut, setOpenOut] = useState<string | null>(null);
  const [outFilter, setOutFilter] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const toAddrs: string[] = Array.from(new Set((inbox.data ?? []).map((m: any) => m.toEmail).filter(Boolean))) as string[];
  const inboxRows = (inbox.data ?? []).filter((m: any) => !inboxFilter || m.toEmail === inboxFilter);

  // send form
  const [name, setName] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Test email from Lightspeed Talent Assessment');
  const [message, setMessage] = useState('');
  const [sendMsg, setSendMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const sendTest = trpc.emailTest.sendTest.useMutation({
    onSuccess: (r) => {
      if (!r.ok) setSendMsg({ kind: 'err', text: `Send failed: ${r.error}` });
      else if (r.sandbox) setSendMsg({ kind: 'warn', text: 'Logged in test mode — no SendGrid key set yet, so nothing was actually emailed.' });
      else setSendMsg({ kind: 'ok', text: `Sent to ${to} via SendGrid.` });
    },
    onError: (e) => setSendMsg({ kind: 'err', text: e.message }),
  });

  // simulate inbound
  const [simFrom, setSimFrom] = useState('');
  const [simBody, setSimBody] = useState('');
  const simulate = trpc.emailTest.simulateInbound.useMutation({ onSuccess: () => { setSimFrom(''); setSimBody(''); inbox.refetch(); } });
  const clearInbox = trpc.emailTest.clearInbound.useMutation({ onSuccess: () => inbox.refetch() });
  const deleteMsg = trpc.emailTest.deleteInbound.useMutation({ onSuccess: () => inbox.refetch() });

  const config = cfg.data;
  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/inbound-email`;

  return (
    <div style={c.wrap}>
      {config && (
        <div style={c.banner(config.configured)}>
          {config.configured
            ? <>✓ SendGrid is configured. Sending as <strong>{config.fromName} &lt;{config.from}&gt;</strong>{config.replyTo ? <> · replies to <strong>{config.replyTo}</strong></> : ''}.</>
            : <>⚠ No SendGrid key set yet — emails are logged, not sent. Add <span style={c.code}>SENDGRID_API_KEY</span> in Railway to go live.</>}
        </div>
      )}

      <div style={c.grid}>
        {/* ── SEND ── */}
        <div style={c.card}>
          <p style={c.h}>Send a test email</p>
          <p style={c.sub}>Sends through SendGrid using the app's email service.</p>
          <label style={c.label}>Name (optional)</label>
          <input style={c.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          <label style={c.label}>Email address</label>
          <input style={c.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="[email protected]" />
          <label style={c.label}>Subject</label>
          <input style={c.input} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label style={c.label}>Message</label>
          <textarea style={c.textarea} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a test message…" />
          <button
            style={{ ...c.btn, opacity: sendTest.isLoading || !to || !message ? 0.6 : 1 }}
            disabled={sendTest.isLoading || !to || !message}
            onClick={() => { setSendMsg(null); sendTest.mutate({ to, name: name || undefined, subject, message }); }}
          >
            {sendTest.isLoading ? 'Sending…' : 'Send test email'}
          </button>
          {sendMsg && <div style={sendMsg.kind === 'ok' ? c.msgOk : sendMsg.kind === 'warn' ? c.msgWarn : c.msgErr}>{sendMsg.text}</div>}
        </div>

        {/* ── RECEIVE ── */}
        <div style={c.card}>
          <p style={c.h}>Test inbox</p>
          <p style={c.sub}>Replies and incoming mail land here. Point SendGrid Inbound Parse at <span style={c.code}>{webhookUrl}</span>, or drop a test message in below.</p>
          <label style={c.label}>Simulate an inbound message — from</label>
          <input style={c.input} value={simFrom} onChange={(e) => setSimFrom(e.target.value)} placeholder="[email protected]" />
          <label style={c.label}>Message</label>
          <textarea style={{ ...c.textarea, minHeight: 60 }} value={simBody} onChange={(e) => setSimBody(e.target.value)} placeholder="Pretend a candidate replied…" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              style={{ ...c.btn, marginTop: 0, opacity: simulate.isLoading || !simFrom || !simBody ? 0.6 : 1 }}
              disabled={simulate.isLoading || !simFrom || !simBody}
              onClick={() => simulate.mutate({ fromEmail: simFrom, body: simBody, subject: 'Reply (simulated)' })}
            >
              {simulate.isLoading ? 'Adding…' : 'Drop in inbox'}
            </button>
            <button style={c.btnGhost} onClick={() => inbox.refetch()}>Refresh</button>
            <button style={c.btnGhost} onClick={() => clearInbox.mutate()}>Clear</button>
          </div>
        </div>
      </div>

      {/* ── INBOX LIST ── */}
      <div style={{ ...c.card, marginTop: 16 }}>
        <p style={c.h}>Received messages</p>
        <p style={c.sub}>{inbox.data?.length ? `${inbox.data.length} message(s) · auto-refreshing` : 'Nothing received yet.'}</p>
        {toAddrs.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' }}>
            <button onClick={() => setInboxFilter(null)} style={{ ...c.btnGhost, fontWeight: inboxFilter === null ? 700 : 400 }}>All inboxes</button>
            {toAddrs.map((addr) => (
              <button key={addr} onClick={() => setInboxFilter(addr)} style={{ ...c.btnGhost, fontWeight: inboxFilter === addr ? 700 : 400 }}>{addr}</button>
            ))}
          </div>
        )}
        {inbox.data && inbox.data.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 88 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 170 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={c.th}>When</th>
                <th style={c.th}>From</th>
                <th style={c.th}>To</th>
                <th style={c.th}>Subject</th>
                <th style={c.th}>Message</th>
                <th style={c.th}>Source</th>
                <th style={c.th}></th>
              </tr>
            </thead>
            <tbody>
              {inboxRows.map((m: any) => {
                const isOpen = openId === m.id;
                const isHtml = (m.body || '').trim().startsWith('<');
                return (
                <Fragment key={m.id}>
                <tr onClick={() => setOpenId(isOpen ? null : m.id)} style={{ cursor: 'pointer', background: isOpen ? '#f3f4f6' : undefined }}>
                  <td style={c.td}>{fmt(m.receivedAt)}</td>
                  <td style={c.tdEllipsis} title={`${m.fromName ? m.fromName + ' ' : ''}<${m.fromEmail}>`}>{m.fromName ? `${m.fromName} ` : ''}&lt;{m.fromEmail}&gt;</td>
                  <td style={c.tdEllipsis} title={m.toEmail || ''}>{m.toEmail || '—'}</td>
                  <td style={{ ...c.tdEllipsis, color: '#1d4ed8', fontWeight: 600 }} title={m.subject || ''}>{m.subject}</td>
                  <td style={{ ...c.tdEllipsis, color: '#4b5563' }} title={(m.body || '').replace(/<[^>]+>/g, ' ').slice(0, 300)}>{(m.body || '').replace(/<[^>]+>/g, ' ').slice(0, 160)}</td>
                  <td style={c.td}><span style={{ ...c.code, color: m.source === 'webhook' ? '#1d4ed8' : '#92400e' }}>{m.source}</span></td>
                  <td style={c.td} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button style={c.btnGhost} onClick={() => setOpenId(isOpen ? null : m.id)}>{isOpen ? 'Hide' : 'View'}</button>
                      {m.raw?.approvalUrl && (
                        <a href={m.raw.approvalUrl} target="_blank" rel="noreferrer" style={{ ...c.btnGhost, textDecoration: 'none', color: '#1d4ed8', borderColor: '#bfd4ff' }}>Open &amp; review</a>
                      )}
                      <button style={c.btnGhost} onClick={() => { setTo(m.fromEmail); setName(m.fromName || ''); setSubject(`Re: ${m.subject || ''}`); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Reply</button>
                      <button style={{ ...c.btnGhost, color: '#b91c1c', borderColor: '#f3c9c9' }} disabled={deleteMsg.isLoading} onClick={() => deleteMsg.mutate({ id: m.id })}>Delete</button>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7} style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #eee' }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: '#111' }}>{m.subject}</div>
                      {isHtml ? (
                        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 500, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: m.body }} />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{m.body || '(no body)'}</div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── OUTBOX (emails the app sent) ── */}
      <div style={{ ...c.card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <p style={c.h}>Outbox — emails the app sent</p>
            <p style={c.sub}>{outbox.data?.length ? `${outbox.data.length} captured · auto-refreshing. Every automated email is recorded here with its full content (test mode = not actually delivered).` : 'No emails captured yet. Move a candidate through the pipeline or submit an intake to generate emails.'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={c.btnGhost} onClick={() => outbox.refetch()}>Refresh</button>
            <button style={c.btnGhost} onClick={() => clearOutbox.mutate()}>Clear</button>
          </div>
        </div>
        {(() => {
          const templates: string[] = Array.from(new Set((outbox.data ?? []).map((m: any) => m.template).filter(Boolean))) as string[];
          const rows = (outbox.data ?? []).filter((m: any) => !outFilter || m.template === outFilter);
          return (
          <>
          {templates.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' }}>
              <button onClick={() => setOutFilter(null)} style={{ ...c.btnGhost, fontWeight: outFilter === null ? 700 : 400 }}>All ({outbox.data?.length ?? 0})</button>
              {templates.map((t) => (
                <button key={t} onClick={() => setOutFilter(t)} style={{ ...c.btnGhost, fontWeight: outFilter === t ? 700 : 400 }}>{t}</button>
              ))}
            </div>
          )}
          {rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 110 }} /><col style={{ width: 200 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 90 }} /><col style={{ width: 70 }} /></colgroup>
              <thead>
                <tr>
                  <th style={c.th}>When</th>
                  <th style={c.th}>To</th>
                  <th style={c.th}>Template</th>
                  <th style={c.th}>Subject</th>
                  <th style={c.th}>Status</th>
                  <th style={c.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m: any) => {
                  const isOpen = openOut === m.id;
                  const isHtml = (m.body || '').trim().startsWith('<');
                  return (
                  <Fragment key={m.id}>
                    <tr onClick={() => setOpenOut(isOpen ? null : m.id)} style={{ cursor: 'pointer', background: isOpen ? '#f3f4f6' : undefined }}>
                      <td style={c.td}>{fmt(m.createdAt)}</td>
                      <td style={c.tdEllipsis} title={m.recipient}>{m.recipient}</td>
                      <td style={c.td}><span style={c.code}>{m.template}</span></td>
                      <td style={{ ...c.tdEllipsis, color: '#1d4ed8', fontWeight: 600 }} title={m.subject || ''}>{m.subject}</td>
                      <td style={c.td}><span style={{ ...c.code, color: m.status === 'sent' ? '#065f46' : m.status === 'failed' ? '#b91c1c' : '#92400e' }}>{m.status}</span></td>
                      <td style={c.td} onClick={(e) => e.stopPropagation()}>
                        <button style={c.btnGhost} onClick={() => setOpenOut(isOpen ? null : m.id)}>{isOpen ? 'Hide' : 'View'}</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #eee' }}>
                          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>To: {m.recipient} · Template: {m.template} · Status: {m.status}{m.error ? ` · ${m.error}` : ''}</div>
                          <div style={{ fontWeight: 700, marginBottom: 8, color: '#111' }}>{m.subject}</div>
                          {isHtml
                            ? <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 500, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: m.body }} />
                            : <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{m.body || '(no body)'}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          </>
          );
        })()}
      </div>
    </div>
  );
}
