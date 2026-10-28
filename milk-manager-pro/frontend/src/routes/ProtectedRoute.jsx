/**
 * ProtectedRoute.jsx
 * ------------------
 * Wraps any page that requires login. If there's no logged-in user, it
 * redirects to /login instead of rendering the page.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="full-page-loader">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function StaffOnly({ children }) {
  const { user } = useAuth();
  if (user?.role === 'customer') {
    return <Navigate to="/my" replace />;
  }
  return children;
}

export function CustomerOnly({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'customer') {
    return <Navigate to="/customers" replace />;
  }
  return children;
}

export function HomeRedirect() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="full-page-loader">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'customer') {
    return <Navigate to="/my" replace />;
  }
  return <Navigate to="/customers" replace />;
}
