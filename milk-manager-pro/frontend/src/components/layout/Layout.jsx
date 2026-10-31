/**
 * Layout.jsx
 * ----------
 * The frame around every logged-in page. Three responsibilities:
 *
 * 1. Desktop: a collapsible sidebar (icons+labels, or icons-only with
 *    hover tooltips when collapsed) plus a topbar with a page title,
 *    quick customer search, notifications, and the user's avatar.
 * 2. Mobile: a compact header with a hamburger that opens a full-screen
 *    nav drawer, plus the bottom tab bar for the 4 most-used sections.
 * 3. Wraps whatever page it's given in <PageTransition> so navigating
 *    between pages fades/slides smoothly instead of snapping instantly.
 */

import { useState } from 'react';
import { NavLink, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users, Sun as SunIcon, Wallet, BarChart3, Receipt, Settings as SettingsIcon,
  Menu, X, Search, Bell, LogOut, ChevronsLeft, ChevronsRight, Droplets, Milk,
  LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePageHeaderContext } from '../../context/PageHeaderContext';
import PageTransition from '../ui/PageTransition';
import ThemeToggle from '../ui/ThemeToggle';

const OWNER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/delivery/morning', label: 'Delivery', icon: SunIcon, matchPrefix: '/delivery' },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const CUSTOMER_NAV = [
  { to: '/my', label: 'My milk', icon: Milk },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const OWNER_MOBILE_NAV = [
  OWNER_NAV[0], // Dashboard
  OWNER_NAV[1], // Customers
  OWNER_NAV[2], // Delivery
  { to: '/more', label: 'More', icon: Menu },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const isCustomer = user?.role === 'customer';
  const NAV_ITEMS = isCustomer ? CUSTOMER_NAV : OWNER_NAV;
  const MOBILE_NAV_ITEMS = isCustomer ? CUSTOMER_NAV : OWNER_MOBILE_NAV;
  const navigate = useNavigate();
  const location = useLocation();
  const { header } = usePageHeaderContext();
  const { title, subtitle } = header;

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mmp_sidebar_collapsed') === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('mmp_sidebar_collapsed', !c ? '1' : '0');
      return !c;
    });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/customers?search=${encodeURIComponent(search.trim())}`);
  };

  const isItemActive = (item) =>
    item.matchPrefix ? location.pathname.startsWith(item.matchPrefix) : location.pathname === item.to;

  const initials = (user?.full_name || user?.username || '?').slice(0, 1).toUpperCase();

  return (
    <div className="app-shell">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="logo-badge"><Droplets size={17} color="white" /></div>
          <span className="brand-text">Milk Manager</span>
          <button className="sidebar-collapse-btn" onClick={toggleCollapsed} aria-label="Toggle sidebar" title="Toggle sidebar">
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} active={isItemActive(item)} collapsed={collapsed} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-text">
            <div className="sidebar-footer-name">{user?.full_name || user?.username}</div>
            <div>@{user?.username}</div>
          </div>
          <button
            onClick={logout}
            className="btn btn-ghost btn-sm btn-block"
            style={{ marginTop: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}
            title="Log out"
          >
            <LogOut size={15} /> {!collapsed && 'Log out'}
          </button>
        </div>
      </aside>

      <div className="app-main">
        {/* ---------------- Desktop topbar ---------------- */}
        <header className="topbar">
          <div className="topbar-title">
            <h1>{title || 'Dashboard'}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="topbar-actions">
            {!isCustomer && (
              <form onSubmit={handleSearchSubmit}>
                <div className="search-bar" style={{ marginBottom: 0, width: 220 }}>
                  <Search size={16} color="var(--color-text-faint)" />
                  <input
                    placeholder="Search customers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </form>
            )}
            <button className="topbar-icon-btn" title="Notifications" aria-label="Notifications">
              <Bell size={17} />
              <span className="dot" />
            </button>
            <ThemeToggle />
            <div className="topbar-avatar" title={user?.full_name || user?.username}>{initials}</div>
          </div>
        </header>

        {/* ---------------- Mobile header ---------------- */}
        <header className="top-header">
          <button className="mobile-icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <h1>{title || 'Milk Manager Pro'}</h1>
          <div className="mobile-topbar-actions">
            <button className="mobile-icon-btn" onClick={logout} aria-label="Log out"><LogOut size={16} /></button>
          </div>
        </header>

        {/* ---------------- Page content, animated on route change --------- */}
        <main className="page-content">
          <AnimatePresence mode="wait">
            <PageTransition routeKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>

        {/* ---------------- Mobile bottom nav ---------------- */}
        <nav className="bottom-nav">
          {MOBILE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={
                item.matchPrefix
                  ? location.pathname.startsWith(item.matchPrefix) ? 'active' : ''
                  : ({ isActive }) => (isActive ? 'active' : '')
              }
            >
              <span className="nav-icon"><item.icon size={20} strokeWidth={2.2} /></span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ---------------- Mobile full nav drawer ---------------- */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: '78%', maxWidth: 300,
                background: 'var(--color-surface)', zIndex: 60, padding: 18,
                boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
              }}
            >
              <div className="flex-between mb-12">
                <div className="flex-gap">
                  <div className="logo-badge" style={{ width: 32, height: 32 }}><Droplets size={15} color="white" /></div>
                  <strong>Milk Manager</strong>
                </div>
                <button className="modal-close-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setDrawerOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px',
                    borderRadius: 10, fontWeight: 600, fontSize: '0.92rem',
                    color: isItemActive(item) ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                    background: isItemActive(item) ? 'var(--color-primary-light)' : 'transparent',
                  }}
                >
                  <item.icon size={18} /> {item.label}
                </NavLink>
              ))}
              <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                <div className="text-sm text-muted mb-12">{user?.full_name || user?.username}</div>
                <ThemeToggle />
                <button className="btn btn-outline btn-block mt-12" onClick={logout}>
                  <LogOut size={15} /> Log out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLink({ item, active, collapsed }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NavLink to={item.to} className={`nav-link ${active ? 'active' : ''}`}>
        <span className="nav-icon-wrap"><Icon size={18} strokeWidth={2.2} /></span>
        <span className="nav-label">{item.label}</span>
      </NavLink>
      {collapsed && hovered && <span className="nav-tooltip">{item.label}</span>}
    </div>
  );
}
