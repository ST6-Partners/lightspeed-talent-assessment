// ============================================================
// WHAT'S NEW — button + modal for latest release notes (RCDO pattern)
// Shows a sparkle icon in the top bar; clicking opens a modal
// with the latest published release notes
// ============================================================

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { trpc } from '../lib/trpc';

function formatDate(iso: string | Date | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function WhatsNew() {
  const [open, setOpen] = useState(false);
  const { data: latest } = trpc.releases.latest.useQuery();

  if (!latest) return null; // No published releases — hide button

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors relative"
        title="What's New"
      >
        <Sparkles className="w-5 h-5" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.35)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, width: 540, maxHeight: '80vh',
              overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              padding: '28px 28px 20px', borderRadius: '12px 12px 0 0',
              position: 'relative',
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'rgba(255,255,255,0.2)', border: 'none',
                  borderRadius: 6, padding: 4, cursor: 'pointer',
                  color: '#fff', display: 'flex',
                }}
              >
                <X size={16} />
              </button>
              <span style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: 12,
                background: 'rgba(255,255,255,0.2)', color: '#fff',
                fontSize: 11, fontWeight: 700, marginBottom: 10,
              }}>
                {latest.version}
              </span>
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                {latest.title}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6, margin: 0 }}>
                Published {formatDate(latest.publishedAt)}
              </p>
            </div>

            {/* Content */}
            <div style={{
              padding: '24px 28px 28px',
              fontSize: 14, color: '#374151', lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}>
              {latest.content}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
