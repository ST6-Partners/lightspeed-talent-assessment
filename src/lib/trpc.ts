import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../server/src/router.js';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: '/api/trpc',
      // Send the bearer token (set at login) so auth works inside Replit's
      // cross-site preview iframe, where the session cookie is blocked as a
      // third-party cookie. `credentials: 'include'` keeps the cookie path
      // working too for first-party / new-tab use.
      headers() {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      fetch(url, options) {
        return fetch(url, { ...options, credentials: 'include' });
      },
    }),
  ],
});
