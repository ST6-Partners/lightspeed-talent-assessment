import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite runs in MIDDLEWARE MODE inside Express (see server.ts). No
// standalone dev server. The fields under `server` below apply to
// Vite's host-allowlist check and HMR behavior; port/host/proxy are
// ignored in middleware mode.
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow any Host header — Replit dev URLs are auto-generated and
    // would otherwise be rejected with "Blocked request. This host is
    // not allowed."
    allowedHosts: true,
    // Replit serves the dev URL over HTTPS on port 443 externally. The
    // HMR WS has to target that, not the internal Express port, so the
    // browser (inside Replit's iframe) can actually connect.
    hmr: {
      clientPort: 443,
      protocol: 'wss',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
