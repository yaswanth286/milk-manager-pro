
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Droplets } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

function loginHome(from) {
  if (!from || from === '/dashboard' || from.startsWith('/my')) {
    return '/customers';
  }
  return from;
}

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated) return;

    navigate(loginHome(location.state?.from), { replace: true });
  }, [loading, isAuthenticated, navigate, location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(username.trim(), password);
      navigate(loginHome(location.state?.from), { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          'Login failed. Check your username and password.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="login-logo">
          <Droplets size={24} color="white" />
        </div>

        <h2>Milk Manager Pro</h2>
        <p className="subtitle">
          Manage your daily milk delivery business
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label>Username</label>
            <input
              className="form-control"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label>Password</label>
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
          >
            {submitting ? <span className="spinner-sm" /> : null}
            {submitting ? 'Signing in...' : 'Log In'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

