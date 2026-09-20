import { User, Palette, Info, Sparkles } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/ui/ThemeToggle';

export default function Settings() {
  usePageHeader('Settings', 'Account, appearance, and app info');
  const { user, logout } = useAuth();

  return (
    <div>
      <div className="card mb-12">
        <div className="flex-gap section-title" style={{ margin: '0 0 14px' }}>
          <User size={16} /> Account
        </div>
        <div className="text-sm text-muted">Logged in as</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{user?.full_name || user?.username}</div>
        <div className="text-sm text-muted">@{user?.username} · {user?.role}</div>
        <button className="btn btn-danger btn-block mt-16" onClick={logout}>Log Out</button>
      </div>

      <div className="card mb-12">
        <div className="flex-between">
          <div className="flex-gap section-title" style={{ margin: 0 }}>
            <Palette size={16} /> Appearance
          </div>
          <ThemeToggle />
        </div>
        <div className="text-sm text-muted mt-12">Switch between light and dark mode. Your choice is remembered on this device.</div>
      </div>

      <div className="card mb-12">
        <div className="flex-gap section-title" style={{ margin: '0 0 10px' }}>
          <Info size={16} /> About
        </div>
        <div className="text-sm text-muted">
          Milk Manager Pro v1.0 — built with React + FastAPI + PostgreSQL.
        </div>
      </div>

      <div className="card">
        <div className="flex-gap section-title" style={{ margin: '0 0 10px' }}>
          <Sparkles size={16} /> Coming Soon
        </div>
        <ul className="text-sm text-muted" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Milk rate change history per customer</li>
          <li>SMS/WhatsApp bill reminders</li>
          <li>PDF export for bills</li>
          <li>Multiple staff logins with roles</li>
          <li>Route/delivery-order planning</li>
        </ul>
      </div>
    </div>
  );
}
