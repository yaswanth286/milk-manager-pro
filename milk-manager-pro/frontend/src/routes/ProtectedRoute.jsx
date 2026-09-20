/**
 * ProtectedRoute.jsx
 * ------------------
 * Wraps any page that requires login. If there's no logged-in user, it
 * redirects to /login instead of rendering the page. This is how we make
 * sure someone can't just type /dashboard in the URL bar and see your
 * business data without logging in first.
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
