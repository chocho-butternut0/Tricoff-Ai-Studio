import React, { useState } from 'react';
import { Coffee, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface LoginPageProps {
  onLogin: (token: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        onLogin(data.token);
      } else {
        setError('Incorrect password. Try again.');
        setPassword('');
      }
    } catch {
      setError('Could not reach the server. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page min-h-screen flex items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 mb-4">
            <Coffee className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="font-serif-display text-3xl font-bold admin-text tracking-tight">
            TRICOFF
          </h1>
          <p className="text-sm admin-text-3 mt-1">Admin Panel</p>
        </div>

        {/* Card */}
        <div className="admin-card p-7 shadow-2xl">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4 admin-text-3" />
            <h2 className="text-sm font-semibold admin-text-2">Sign in to continue</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-xs font-medium admin-text-3 mb-1.5">
                Admin password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="admin-input w-full text-sm rounded-xl px-4 py-3 pr-11"
                  placeholder="Enter password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="admin-quiet absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 dark:bg-red-950/50 dark:border-red-800/60 dark:text-red-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs admin-faint mt-5">
          Kiosk screen runs at{' '}
          <a href="/kiosk" target="_blank" className="text-amber-600 hover:text-amber-500 dark:text-amber-500 dark:hover:text-amber-400 underline">
            /kiosk
          </a>{' '}
          — no login required
        </p>
      </div>
    </div>
  );
}
