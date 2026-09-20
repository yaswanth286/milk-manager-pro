/**
 * PageHeaderContext.jsx
 * -----------------------
 * Lets the currently-rendered PAGE tell the persistent Layout (sidebar +
 * topbar) what title/subtitle to show, without the Layout needing to be
 * re-created every time the route changes. This is what makes the sidebar
 * and topbar feel "fixed" while only the content area transitions.
 *
 * Usage inside any page:
 *   usePageHeader('Customers', 'Manage your delivery list');
 */

import { createContext, useContext, useState, useEffect } from 'react';

const PageHeaderContext = createContext(null);

export function PageHeaderProvider({ children }) {
  const [header, setHeader] = useState({ title: 'Milk Manager Pro', subtitle: '' });
  return <PageHeaderContext.Provider value={{ header, setHeader }}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeaderContext() {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error('usePageHeaderContext must be used inside a PageHeaderProvider');
  return ctx;
}

/** Call this once at the top of any page component. */
export function usePageHeader(title, subtitle = '') {
  const { setHeader } = usePageHeaderContext();
  useEffect(() => {
    setHeader({ title, subtitle });
  }, [title, subtitle, setHeader]);
}
