// ============================================================
// GETTING STARTED — Onboarding guide with video tutorials
// Pattern: RCDO inline styles, video player, step-by-step guide
// Data: onboardingVideos table (CRUD via admin), static architecture
// ============================================================

import { useState, useCallback } from 'react';
import { trpc } from '../../lib/trpc';

// ── Styles (RCDO inline pattern) ────────────────────────────
const st = {
  container: { maxWidth: 1100 } as React.CSSProperties,
  // Welcome banner
  banner: {
    background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
    borderRadius: 10,
    border: '1px solid #bfdbfe',
    padding: '28px 32px',
    marginBottom: 24,
  } as React.CSSProperties,
  bannerTitle: { fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 6 } as React.CSSProperties,
  bannerSub: { fontSize: 14, color: '#4b5563', margin: 0, lineHeight: 1.5 } as React.CSSProperties,
  // Section headers
  sectionHeader: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0, marginBottom: 14 } as React.CSSProperties,
  sectionSub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 } as React.CSSProperties,
  // Videos
  videoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 28 } as React.CSSProperties,
  videoCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s' } as React.CSSProperties,
  videoThumb: { width: '100%', height: 180, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' as const } as React.CSSProperties,
  playIcon: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(37,99,235,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' } as React.CSSProperties,
  videoInfo: { padding: '12px 14px' } as React.CSSProperties,
  videoTitle: { fontSize: 14, fontWeight: 600, color: '#111827', margin: 0, marginBottom: 4 } as React.CSSProperties,
  videoDesc: { fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.4 } as React.CSSProperties,
  videoCategoryBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', marginBottom: 6 } as React.CSSProperties,
  emptyVideos: { textAlign: 'center' as const, padding: 32, color: '#9ca3af', fontSize: 13, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 28 } as React.CSSProperties,
  // Modal
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
  modalContent: { background: '#000', borderRadius: 10, overflow: 'hidden', width: '90%', maxWidth: 900 } as React.CSSProperties,
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#111' } as React.CSSProperties,
  modalTitle: { fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 } as React.CSSProperties,
  modalClose: { background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', padding: '4px 8px' } as React.CSSProperties,
  videoEmbed: { width: '100%', height: 500, border: 'none' } as React.CSSProperties,
  // Steps
  stepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 28 } as React.CSSProperties,
  stepCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' } as React.CSSProperties,
  stepNumber: { width: 28, height: 28, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 } as React.CSSProperties,
  stepTitle: { fontSize: 14, fontWeight: 600, color: '#111827', margin: 0, marginBottom: 4 } as React.CSSProperties,
  stepDesc: { fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5 } as React.CSSProperties,
  // Architecture
  archGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 28 } as React.CSSProperties,
  archCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' } as React.CSSProperties,
  archPath: { fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 } as React.CSSProperties,
  archItem: { fontSize: 12, color: '#374151', fontFamily: 'monospace', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
  archIcon: { color: '#9ca3af', fontSize: 11, flexShrink: 0 } as React.CSSProperties,
  // Resources
  resourcesCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 24 } as React.CSSProperties,
  resourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 } as React.CSSProperties,
  resourceLink: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, border: '1px solid #e5e7eb', textDecoration: 'none', color: '#111827', transition: 'background 0.15s' } as React.CSSProperties,
  resourceName: { fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 } as React.CSSProperties,
  resourceDesc: { fontSize: 11, color: '#6b7280', margin: 0 } as React.CSSProperties,
  // Tips
  tipBox: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 18px' } as React.CSSProperties,
  tipTitle: { fontSize: 14, fontWeight: 600, color: '#1e3a5f', marginBottom: 8, margin: 0 } as React.CSSProperties,
  tipItem: { fontSize: 12, color: '#1e40af', lineHeight: 1.7, margin: 0 } as React.CSSProperties,
  // Admin video management
  adminBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 } as React.CSSProperties,
  addBtn: { padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  formOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 } as React.CSSProperties,
  formCard: { background: '#fff', borderRadius: 10, padding: 24, width: 480, maxHeight: '90vh', overflow: 'auto' } as React.CSSProperties,
  formTitle: { fontSize: 16, fontWeight: 700, color: '#111827', margin: 0, marginBottom: 16 } as React.CSSProperties,
  formGroup: { marginBottom: 14 } as React.CSSProperties,
  formLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 } as React.CSSProperties,
  formInput: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  formTextarea: { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', boxSizing: 'border-box' as const, minHeight: 60, resize: 'vertical' as const } as React.CSSProperties,
  formActions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 } as React.CSSProperties,
  cancelBtn: { padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  saveBtn: { padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  deleteBtn: { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  toggleBtn: { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  videoAdminActions: { display: 'flex', gap: 6, marginTop: 8 } as React.CSSProperties,
  inactiveBadge: { display: 'inline-block', padding: '2px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: '#fef2f2', color: '#991b1b', marginLeft: 6 } as React.CSSProperties,
  toast: { padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 12, background: '#f0fdf4', color: '#059669', border: '1px solid #bbf7d0' } as React.CSSProperties,
};

// ── Helper: extract YouTube embed URL ───────────────────────
function getEmbedUrl(url: string): string {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Loom
  const loomMatch = url.match(/loom\.com\/share\/([\w-]+)/);
  if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  // Default: return as-is (direct embed)
  return url;
}

// ── Helper: extract YouTube thumbnail ───────────────────────
function getThumbnailUrl(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
  return null;
}

const STEPS = [
  { number: 1, title: 'Replace Sample Entities', description: 'Replace the default entity schema with your domain entities. Update schema.ts with your definitions and run db:push.' },
  { number: 2, title: 'Update tRPC Routers', description: 'Build tRPC procedures for each entity. Create routers in server/src/routers/ following the existing CRUD patterns.' },
  { number: 3, title: 'Build Domain Screens', description: 'Create React pages for your entities in src/pages/. Use the trpc hooks for type-safe data operations.' },
  { number: 4, title: 'Add Claude Tools', description: 'Define Claude tools in server/src/tools/ to enable AI integration with your domain logic. Wire them into the chat adapter.' },
  { number: 5, title: 'Push & Seed', description: 'Run npm run db:push to apply schema changes. Set up seeding in db/seed.ts for development data.' },
];

const ARCHITECTURE = [
  { path: 'src/', items: ['pages/', 'components/', 'lib/trpc.ts', 'hooks/', 'App.tsx'] },
  { path: 'server/src/', items: ['routers/', 'db/', 'services/', 'trpc.ts'] },
  { path: 'db/', items: ['schema/', 'seed.ts', 'migrations/'] },
];

const RESOURCES = [
  { name: 'tRPC Docs', url: 'https://trpc.io/docs', desc: 'Full tRPC documentation' },
  { name: 'React Docs', url: 'https://react.dev', desc: 'React 18 official guide' },
  { name: 'Drizzle ORM', url: 'https://orm.drizzle.team', desc: 'Type-safe database toolkit' },
  { name: 'Lucide React', url: 'https://lucide.dev/icons', desc: 'Icon library reference' },
];

const TIPS = [
  'Use tRPC\'s useQuery and useMutation hooks for type-safe data operations',
  'Keep admin panels as sub-components without their own Layout wrappers',
  'All admin panels use RCDO inline styles — no Tailwind in admin components',
  'Test API endpoints with the tRPC DevTools before building UI',
  'Use the built-in chat interface to test AI integrations and generate real telemetry data',
];

interface VideoFormData {
  id?: string;
  title: string;
  description: string;
  url: string;
  category: string;
  sortOrder: number;
  inputMode: 'url' | 'file';
  uploadFile: File | null;
  uploading: boolean;
}

const EMPTY_FORM: VideoFormData = { title: '', description: '', url: '', category: '', sortOrder: 0, inputMode: 'url', uploadFile: null, uploading: false };

// ── Helper: detect if a URL is an internal stored file ─────
function isStoredFile(url: string): boolean {
  return url.startsWith('/api/files/');
}

// ── Helper: detect if a URL is a playable video file ───────
function isVideoFile(url: string): boolean {
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogg'];
  const lower = url.toLowerCase();
  return videoExts.some(ext => lower.includes(ext));
}

export default function GettingStarted() {
  const [playingVideo, setPlayingVideo] = useState<{ title: string; url: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<VideoFormData>(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);

  // Check if user is admin (show admin controls)
  const { data: me } = trpc.auth.me.useQuery();
  const isAdmin = me && ['admin', 'sysadmin'].includes((me as any).role);

  const utils = trpc.useContext();

  // Admin list shows all (including inactive); user list shows only active
  const { data: videos, isLoading: videosLoading } = isAdmin
    ? trpc.onboardingVideos.adminList.useQuery()
    : trpc.onboardingVideos.list.useQuery();

  const createMutation = trpc.onboardingVideos.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setFormData(EMPTY_FORM);
      setToast('Video added');
      setTimeout(() => setToast(null), 3000);
      utils.onboardingVideos.adminList.invalidate();
      utils.onboardingVideos.list.invalidate();
    },
  });

  const updateMutation = trpc.onboardingVideos.update.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setFormData(EMPTY_FORM);
      setToast('Video updated');
      setTimeout(() => setToast(null), 3000);
      utils.onboardingVideos.adminList.invalidate();
      utils.onboardingVideos.list.invalidate();
    },
  });

  const deleteMutation = trpc.onboardingVideos.delete.useMutation({
    onSuccess: () => {
      setToast('Video deleted');
      setTimeout(() => setToast(null), 3000);
      utils.onboardingVideos.adminList.invalidate();
      utils.onboardingVideos.list.invalidate();
    },
  });

  const handleSave = useCallback(async () => {
    let videoUrl = formData.url;

    // If uploading a file, POST it first
    if (formData.inputMode === 'file' && formData.uploadFile) {
      setFormData(d => ({ ...d, uploading: true }));
      try {
        const buffer = await formData.uploadFile.arrayBuffer();
        const resp = await fetch('/api/upload/video', {
          method: 'POST',
          headers: {
            'Content-Type': formData.uploadFile.type || 'application/octet-stream',
            'x-filename': formData.uploadFile.name,
          },
          body: buffer,
        });
        const result = await resp.json();
        if (!resp.ok || !result.success) {
          setToast(`Upload failed: ${result.error || 'Unknown error'}`);
          setFormData(d => ({ ...d, uploading: false }));
          return;
        }
        videoUrl = result.url; // e.g. /api/files/videos/1234-file.mp4
      } catch (err: any) {
        setToast(`Upload failed: ${err.message}`);
        setFormData(d => ({ ...d, uploading: false }));
        return;
      }
      setFormData(d => ({ ...d, uploading: false }));
    }

    if (formData.id) {
      updateMutation.mutate({
        id: formData.id,
        title: formData.title,
        description: formData.description || undefined,
        url: videoUrl,
        category: formData.category || undefined,
        sortOrder: formData.sortOrder,
      });
    } else {
      createMutation.mutate({
        title: formData.title,
        description: formData.description || undefined,
        url: videoUrl,
        category: formData.category || undefined,
        sortOrder: formData.sortOrder,
      });
    }
  }, [formData, createMutation, updateMutation]);

  const handleEdit = useCallback((v: any) => {
    setFormData({
      id: v.id,
      title: v.title,
      description: v.description || '',
      url: v.url,
      category: v.category || '',
      sortOrder: v.sortOrder,
      inputMode: isStoredFile(v.url) ? 'file' : 'url',
      uploadFile: null,
      uploading: false,
    });
    setShowForm(true);
  }, []);

  const handleToggleActive = useCallback((v: any) => {
    updateMutation.mutate({ id: v.id, isActive: !v.isActive });
  }, [updateMutation]);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Delete this video permanently?')) return;
    deleteMutation.mutate({ id });
  }, [deleteMutation]);

  return (
    <div style={st.container}>
      {/* Welcome banner */}
      <div style={st.banner}>
        <h1 style={st.bannerTitle}>Welcome to Template App</h1>
        <p style={st.bannerSub}>
          A modern React + tRPC + Claude starter with built-in admin panels, telemetry,
          AI chat, and type-safe data handling. Follow the steps below to customize.
        </p>
      </div>

      {/* Toast */}
      {toast && <div style={st.toast}>{toast}</div>}

      {/* Onboarding Videos */}
      <div style={st.adminBar}>
        <div>
          <h2 style={st.sectionHeader}>Video Tutorials</h2>
          <p style={st.sectionSub}>Watch these guides to get up to speed quickly.</p>
        </div>
        {isAdmin && (
          <button style={st.addBtn} onClick={() => { setFormData(EMPTY_FORM); setShowForm(true); }}>
            + Add Video
          </button>
        )}
      </div>

      {videosLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading videos...</p>
      ) : !videos || videos.length === 0 ? (
        <div style={st.emptyVideos}>
          No onboarding videos yet.
          {isAdmin && ' Click "Add Video" to create one.'}
        </div>
      ) : (
        <div style={st.videoGrid}>
          {(videos as any[]).map((v) => {
            const thumb = getThumbnailUrl(v.url);
            const stored = isStoredFile(v.url);
            return (
              <div key={v.id} style={st.videoCard}>
                <div
                  style={st.videoThumb}
                  onClick={() => setPlayingVideo({ title: v.title, url: v.url })}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={v.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : stored ? (
                    <div style={{ color: '#6366f1', fontSize: 12, textAlign: 'center' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
                        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                      <div>Uploaded Video</div>
                    </div>
                  ) : (
                    <div style={{ color: '#9ca3af', fontSize: 12 }}>Video Preview</div>
                  )}
                  <div style={{ position: 'absolute', ...st.playIcon }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
                <div style={st.videoInfo}>
                  {v.category && <span style={st.videoCategoryBadge}>{v.category}</span>}
                  {'isActive' in v && !v.isActive && <span style={st.inactiveBadge}>Inactive</span>}
                  <h4 style={st.videoTitle}>{v.title}</h4>
                  {v.description && <p style={st.videoDesc}>{v.description}</p>}
                  {isAdmin && (
                    <div style={st.videoAdminActions}>
                      <button style={st.toggleBtn} onClick={() => handleEdit(v)}>Edit</button>
                      <button style={st.toggleBtn} onClick={() => handleToggleActive(v)}>
                        {v.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button style={st.deleteBtn} onClick={() => handleDelete(v.id)}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Getting Started Steps */}
      <h2 style={st.sectionHeader}>Getting Started</h2>
      <div style={st.stepsGrid}>
        {STEPS.map((step) => (
          <div key={step.number} style={st.stepCard}>
            <div style={st.stepNumber}>{step.number}</div>
            <div>
              <h4 style={st.stepTitle}>{step.title}</h4>
              <p style={st.stepDesc}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Architecture */}
      <h2 style={st.sectionHeader}>Project Architecture</h2>
      <div style={st.archGrid}>
        {ARCHITECTURE.map((section, idx) => (
          <div key={idx} style={st.archCard}>
            <div style={st.archPath}>{section.path}</div>
            {section.items.map((item, i) => (
              <div key={i} style={st.archItem}>
                <span style={st.archIcon}>&#x2022;</span>
                {item}
              </div>
            ))}
          </div>
        ))}
        <div style={st.archCard}>
          <div style={st.archPath}>Stack</div>
          <div style={st.archItem}><strong>Frontend:</strong>&nbsp;React 18, TypeScript</div>
          <div style={st.archItem}><strong>API:</strong>&nbsp;tRPC + react-query</div>
          <div style={st.archItem}><strong>Database:</strong>&nbsp;Drizzle ORM</div>
          <div style={st.archItem}><strong>AI:</strong>&nbsp;Claude API</div>
        </div>
      </div>

      {/* Resources */}
      <h2 style={st.sectionHeader}>Resources & References</h2>
      <div style={st.resourcesCard}>
        <div style={st.resourceGrid}>
          {RESOURCES.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" style={st.resourceLink}>
              <div>
                <p style={st.resourceName}>{r.name}</p>
                <p style={st.resourceDesc}>{r.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div style={st.tipBox}>
        <h3 style={st.tipTitle}>Development Tips</h3>
        {TIPS.map((tip, i) => (
          <p key={i} style={st.tipItem}>&#x2022; {tip}</p>
        ))}
      </div>

      {/* Video Player Modal */}
      {playingVideo && (
        <div style={st.modalOverlay} onClick={() => setPlayingVideo(null)}>
          <div style={st.modalContent} onClick={e => e.stopPropagation()}>
            <div style={st.modalHeader}>
              <h4 style={st.modalTitle}>{playingVideo.title}</h4>
              <button style={st.modalClose} onClick={() => setPlayingVideo(null)}>&times;</button>
            </div>
            {isStoredFile(playingVideo.url) && isVideoFile(playingVideo.url) ? (
              <video
                src={playingVideo.url}
                style={st.videoEmbed}
                controls
                autoPlay
              />
            ) : (
              <iframe
                src={getEmbedUrl(playingVideo.url)}
                style={st.videoEmbed}
                allowFullScreen
                allow="autoplay; encrypted-media"
                title={playingVideo.title}
              />
            )}
          </div>
        </div>
      )}

      {/* Video Form Modal (Admin) */}
      {showForm && (
        <div style={st.formOverlay} onClick={() => setShowForm(false)}>
          <div style={st.formCard} onClick={e => e.stopPropagation()}>
            <h3 style={st.formTitle}>{formData.id ? 'Edit Video' : 'Add Video'}</h3>
            <div style={st.formGroup}>
              <label style={st.formLabel}>Title *</label>
              <input
                style={st.formInput}
                value={formData.title}
                onChange={e => setFormData(d => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Getting Started with tRPC"
              />
            </div>
            {/* URL / File toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
              <button
                type="button"
                onClick={() => setFormData(d => ({ ...d, inputMode: 'url', uploadFile: null }))}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: formData.inputMode === 'url' ? '#2563eb' : '#f9fafb',
                  color: formData.inputMode === 'url' ? '#fff' : '#6b7280',
                }}
              >
                Paste URL
              </button>
              <button
                type="button"
                onClick={() => setFormData(d => ({ ...d, inputMode: 'file', url: '' }))}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: formData.inputMode === 'file' ? '#2563eb' : '#f9fafb',
                  color: formData.inputMode === 'file' ? '#fff' : '#6b7280',
                }}
              >
                Upload File
              </button>
            </div>

            {formData.inputMode === 'url' ? (
              <div style={st.formGroup}>
                <label style={st.formLabel}>Video URL *</label>
                <input
                  style={st.formInput}
                  value={formData.url}
                  onChange={e => setFormData(d => ({ ...d, url: e.target.value }))}
                  placeholder="YouTube, Loom, or Vimeo URL"
                />
              </div>
            ) : (
              <div style={st.formGroup}>
                <label style={st.formLabel}>Video File *</label>
                <input
                  type="file"
                  accept="video/*"
                  style={{ ...st.formInput, padding: '6px 8px' }}
                  onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setFormData(d => ({ ...d, uploadFile: file }));
                  }}
                />
                {formData.uploadFile && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    {formData.uploadFile.name} ({(formData.uploadFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                )}
                {formData.id && isStoredFile(formData.url) && !formData.uploadFile && (
                  <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
                    Current: uploaded file — select a new file to replace, or leave as-is.
                  </div>
                )}
              </div>
            )}
            <div style={st.formGroup}>
              <label style={st.formLabel}>Description</label>
              <textarea
                style={st.formTextarea}
                value={formData.description}
                onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                placeholder="Brief description of what this video covers"
              />
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ ...st.formGroup, flex: 1 }}>
                <label style={st.formLabel}>Category</label>
                <input
                  style={st.formInput}
                  value={formData.category}
                  onChange={e => setFormData(d => ({ ...d, category: e.target.value }))}
                  placeholder="e.g. Setup, Features, Advanced"
                />
              </div>
              <div style={{ ...st.formGroup, width: 100 }}>
                <label style={st.formLabel}>Sort Order</label>
                <input
                  style={st.formInput}
                  type="number"
                  value={formData.sortOrder}
                  onChange={e => setFormData(d => ({ ...d, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div style={st.formActions}>
              <button style={st.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button
                style={{
                  ...st.saveBtn,
                  opacity: (!formData.title || formData.uploading || (formData.inputMode === 'url' && !formData.url) || (formData.inputMode === 'file' && !formData.uploadFile && !formData.id)) ? 0.5 : 1,
                }}
                disabled={!formData.title || formData.uploading || (formData.inputMode === 'url' && !formData.url) || (formData.inputMode === 'file' && !formData.uploadFile && !formData.id)}
                onClick={handleSave}
              >
                {formData.uploading ? 'Uploading...' : formData.id ? 'Save Changes' : 'Add Video'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
