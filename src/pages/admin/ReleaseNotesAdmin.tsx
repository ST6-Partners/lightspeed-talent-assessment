// ============================================================
// RELEASE NOTES ADMIN — CRUD + publish/unpublish (RCDO pattern)
// Pattern: Admin creates releases as drafts, publishes to notify users
// ============================================================

import { useState, useCallback } from 'react';
import { trpc } from '../../lib/trpc';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Styles ──────────────────────────────────────────────────
const st = {
  container: { maxWidth: 1100 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 } as React.CSSProperties,
  createBtn: { padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, overflow: 'hidden' } as React.CSSProperties,
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  cardBody: { padding: '12px 16px' } as React.CSSProperties,
  version: { fontSize: 14, fontWeight: 700, color: '#111827' } as React.CSSProperties,
  releaseTitle: { fontSize: 13, color: '#374151', marginLeft: 8 } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  publishedBadge: { background: '#dcfce7', color: '#166534' } as React.CSSProperties,
  draftBadge: { background: '#fef3c7', color: '#92400e' } as React.CSSProperties,
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 4 } as React.CSSProperties,
  content: { fontSize: 13, color: '#4b5563', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, marginTop: 8, maxHeight: 200, overflow: 'auto' } as React.CSSProperties,
  actions: { display: 'flex', gap: 6, marginTop: 12 } as React.CSSProperties,
  btn: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  btnPrimary: { border: 'none', background: '#059669', color: '#fff' } as React.CSSProperties,
  btnDanger: { border: 'none', background: '#dc2626', color: '#fff' } as React.CSSProperties,
  btnWarning: { border: 'none', background: '#d97706', color: '#fff' } as React.CSSProperties,
  toast: { padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 12, background: '#f0fdf4', color: '#059669', border: '1px solid #bbf7d0' } as React.CSSProperties,
  toastError: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  // Form
  formOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
  formCard: { background: '#fff', borderRadius: 10, padding: 24, width: 560, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' } as React.CSSProperties,
  formTitle: { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 16, margin: 0 } as React.CSSProperties,
  formGroup: { marginBottom: 14 } as React.CSSProperties,
  formLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 } as React.CSSProperties,
  formInput: { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  formTextarea: { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', minHeight: 180, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' as const } as React.CSSProperties,
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } as React.CSSProperties,
};

// ── Release form (create + edit) ────────────────────────────
interface FormData { version: string; title: string; content: string }

function ReleaseForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: FormData;
  onSave: (data: FormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [version, setVersion] = useState(initial?.version || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');

  const handleSubmit = () => {
    if (!version.trim() || !title.trim() || !content.trim()) return;
    onSave({ version: version.trim(), title: title.trim(), content: content.trim() });
  };

  return (
    <div style={st.formOverlay} onClick={onCancel}>
      <div style={st.formCard} onClick={e => e.stopPropagation()}>
        <h3 style={st.formTitle}>{initial ? 'Edit Release' : 'New Release'}</h3>

        <div style={st.formGroup}>
          <label style={st.formLabel}>Version</label>
          <input
            style={st.formInput}
            value={version}
            onChange={e => setVersion(e.target.value)}
            placeholder="e.g. v1.2.0"
          />
        </div>

        <div style={st.formGroup}>
          <label style={st.formLabel}>Title</label>
          <input
            style={st.formInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Dashboard Improvements"
          />
        </div>

        <div style={st.formGroup}>
          <label style={st.formLabel}>Content</label>
          <textarea
            style={st.formTextarea}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Describe what's new in this release..."
          />
        </div>

        <div style={st.formActions}>
          <button style={st.btn} onClick={onCancel} disabled={saving}>Cancel</button>
          <button
            style={{ ...st.btn, ...st.btnPrimary, opacity: saving ? 0.5 : 1 }}
            onClick={handleSubmit}
            disabled={saving || !version.trim() || !title.trim() || !content.trim()}
          >
            {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function ReleaseNotesAdmin() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const utils = trpc.useContext();
  const { data: releases, isLoading } = trpc.releases.list.useQuery();

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 4000);
  };

  const createMutation = trpc.releases.create.useMutation({
    onSuccess: () => { utils.releases.list.invalidate(); setShowForm(false); showToast('Release created as draft.'); },
    onError: (e) => showToast(e.message, true),
  });

  const updateMutation = trpc.releases.update.useMutation({
    onSuccess: () => { utils.releases.list.invalidate(); setEditingId(null); showToast('Release updated.'); },
    onError: (e) => showToast(e.message, true),
  });

  const publishMutation = trpc.releases.publish.useMutation({
    onSuccess: (data) => { utils.releases.list.invalidate(); showToast(`Published! ${data.notified} users notified.`); },
    onError: (e) => showToast(e.message, true),
  });

  const unpublishMutation = trpc.releases.unpublish.useMutation({
    onSuccess: () => { utils.releases.list.invalidate(); showToast('Release unpublished.'); },
    onError: (e) => showToast(e.message, true),
  });

  const deleteMutation = trpc.releases.delete.useMutation({
    onSuccess: () => { utils.releases.list.invalidate(); showToast('Draft deleted.'); },
    onError: (e) => showToast(e.message, true),
  });

  const handleCreate = useCallback((data: FormData) => {
    createMutation.mutate(data);
  }, [createMutation]);

  const handleUpdate = useCallback((data: FormData) => {
    if (!editingId) return;
    updateMutation.mutate({ id: editingId, ...data });
  }, [editingId, updateMutation]);

  const handlePublish = useCallback((id: string) => {
    if (!window.confirm('Publish this release? All active users will be notified.')) return;
    publishMutation.mutate({ id });
  }, [publishMutation]);

  const handleUnpublish = useCallback((id: string) => {
    if (!window.confirm('Unpublish this release? It will no longer be visible to users.')) return;
    unpublishMutation.mutate({ id });
  }, [unpublishMutation]);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    deleteMutation.mutate({ id });
  }, [deleteMutation]);

  const editingRelease = editingId ? releases?.find((r: any) => r.id === editingId) : null;

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <h3 style={st.title}>Release Notes</h3>
          <p style={st.subtitle}>Create, edit, and publish release notes. Publishing notifies all users.</p>
        </div>
        <button style={st.createBtn} onClick={() => setShowForm(true)}>
          + New Release
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={toast.error ? { ...st.toast, ...st.toastError } : st.toast}>{toast.msg}</div>
      )}

      {/* Release cards */}
      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</p>
      ) : !releases || releases.length === 0 ? (
        <p style={st.empty}>No releases yet. Click "New Release" to create your first one.</p>
      ) : (
        releases.map((r: any) => (
          <div key={r.id} style={st.card}>
            <div style={st.cardHeader}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={st.version}>{r.version}</span>
                  <span style={st.releaseTitle}>— {r.title}</span>
                </div>
                <div style={st.meta}>
                  Created by {r.createdByName || 'Unknown'} · {formatDate(r.createdAt)}
                  {r.publishedAt && <> · Published {formatDate(r.publishedAt)}</>}
                </div>
              </div>
              <span style={{
                ...st.badge,
                ...(r.publishedAt ? st.publishedBadge : st.draftBadge),
              }}>
                {r.publishedAt ? 'Published' : 'Draft'}
              </span>
            </div>
            <div style={st.cardBody}>
              <div style={st.content}>{r.content}</div>
              <div style={st.actions}>
                <button style={st.btn} onClick={() => setEditingId(r.id)}>Edit</button>
                {!r.publishedAt ? (
                  <>
                    <button style={{ ...st.btn, ...st.btnPrimary }} onClick={() => handlePublish(r.id)}>
                      Publish
                    </button>
                    <button style={{ ...st.btn, ...st.btnDanger }} onClick={() => handleDelete(r.id)}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button style={{ ...st.btn, ...st.btnWarning }} onClick={() => handleUnpublish(r.id)}>
                    Unpublish
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Create form */}
      {showForm && (
        <ReleaseForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={createMutation.isLoading}
        />
      )}

      {/* Edit form */}
      {editingId && editingRelease && (
        <ReleaseForm
          initial={{ version: editingRelease.version, title: editingRelease.title, content: editingRelease.content }}
          onSave={handleUpdate}
          onCancel={() => setEditingId(null)}
          saving={updateMutation.isLoading}
        />
      )}
    </div>
  );
}
