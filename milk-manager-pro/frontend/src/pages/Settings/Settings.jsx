import { User, Palette } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/ui/ThemeToggle';

export default function Settings() {
  usePageHeader('Settings', 'Account and appearance');
  const { user, logout } = useAuth();

  return (
    <div>
      <div className="card mb-12">
        <div className="flex-gap section-title" style={{ margin: '0 0 14px' }}>
          <User size={16} /> Account
        </div>
        <div className="text-sm text-muted">Logged in as</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
          {user?.full_name || user?.username}
        </div>
        <div className="text-sm text-muted">@{user?.username} · {user?.role}</div>
        <button className="btn btn-danger btn-block mt-16" onClick={logout}>
          Log Out
        </button>
      </div>

      <div className="card">
        <div className="flex-between">
          <div className="flex-gap section-title" style={{ margin: 0 }}>
            <Palette size={16} /> Appearance
          </div>
          <ThemeToggle />
        </div>
        <div className="text-sm text-muted mt-12">
          Switch between light and dark mode. Your choice is remembered on this device.
        </div>
      </div>
    </div>
  );
}
