/**
 * AuthContext.jsx
 * ----------------
 * React Context that holds "is someone logged in, and who" for the whole
 * app. Wrapping <App /> in <AuthProvider> lets ANY component call
 * `useAuth()` to read the current user or call `login()` / `logout()`,
 * without passing props down through every layer.
 *
 * The actual token is stored in localStorage (survives page refresh /
 * closing the browser tab) - api.js reads it automatically for every
 * request.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On first app load, if a token is already saved, verify it's still
    // valid by asking the backend "who am I" (also restores the user's
    // name after a page refresh).
    const token = localStorage.getItem('mmp_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authService
      .getCurrentUser()
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem('mmp_token');
        localStorage.removeItem('mmp_user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await authService.login(username, password);
    localStorage.setItem('mmp_token', data.access_token);
    const me = await authService.getCurrentUser();
    setUser(me);
    localStorage.setItem('mmp_user', JSON.stringify(me));
    return me;
  };

  const logout = () => {
    localStorage.removeItem('mmp_token');
    localStorage.removeItem('mmp_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
