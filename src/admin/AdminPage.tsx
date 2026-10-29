import { useState, useEffect } from 'react';
import { LoginPage } from './LoginPage';
import { AdminDashboard } from './AdminDashboard';

export function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking

  // Check if there's already a valid session cookie on mount
  useEffect(() => {
    fetch('/api/admin/check', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setAuthed(d.ok === true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div className="admin-page min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return <AdminDashboard onLogout={() => setAuthed(false)} />;
}
