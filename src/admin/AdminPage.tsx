import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
        <Loader2 className="w-8 h-8 text-[#A5754A] animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return <AdminDashboard onLogout={() => setAuthed(false)} />;
}
