// ============================================================
// LOGIN — email/password (Sequence 3, 2026-06-05)
//
// Email/password auth. Two modes: Sign in and
// Create account, both backed by tRPC auth.login / auth.register.
// On success we hard-navigate to "/" so the app re-fetches auth.me
// with the new session cookie.
// ============================================================

import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Mode = 'login' | 'register';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Persist the bearer token, then hard-navigate to "/" so the app
  // re-fetches auth.me with the Authorization header set.
  const onDone = (data: { token?: string }) => {
    if (data?.token) localStorage.setItem('auth_token', data.token);
    window.location.href = '/';
  };

  const loginMut = trpc.auth.login.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const registerMut = trpc.auth.register.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  const busy = loginMut.isLoading || registerMut.isLoading;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'login') {
      loginMut.mutate({ email, password });
    } else {
      registerMut.mutate({ email, password, name: name || undefined });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Template App</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden mb-5 text-sm">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 py-2 font-medium ${mode === 'login' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex-1 py-2 font-medium ${mode === 'register' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Create account
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400 text-center">
          {mode === 'login' ? 'No account yet? Use “Create account” above.' : 'The first account created becomes the admin.'}
        </p>
      </div>
    </div>
  );
}
