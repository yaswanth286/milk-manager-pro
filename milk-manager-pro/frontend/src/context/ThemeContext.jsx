/**
 * ThemeContext.jsx
 * -----------------
 * Handles light/dark mode for the whole app. The actual color values live
 * in global.css as CSS variables under `:root` and `[data-theme='dark']` -
 * this context's only job is to flip the `data-theme` attribute on the
 * <html> element and remember the choice in localStorage so it persists
 * across visits.
 */

import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('mmp_theme');
    if (saved) return saved;
    // Respect the OS/browser preference the first time, then remember
    // whatever the user picks after that.
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mmp_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
