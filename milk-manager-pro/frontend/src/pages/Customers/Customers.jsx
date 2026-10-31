import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Users } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { listCustomers } from '../../services/customerService';
import { formatCurrency } from '../../utils/format';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Skeleton';

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Archived' },
];

export default function Customers() {
  usePageHeader('Customers', 'Manage your delivery list and balances');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers]   = useState([]);
  const [search,    setSearch]      = useState(searchParams.get('search') || '');
  const [filter,    setFilter]      = useState('all');
  const [loading,   setLoading]     = useState(true);

  const fetchCustomers = useCallback((q) => {
    setLoading(true);
    listCustomers(q)
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchCustomers(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchCustomers]);

  useEffect(() => {
    if (search) setSearchParams({ search }, { replace: true });
    else        setSearchParams({},          { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const visible = customers.filter((c) => {
    if (filter === 'active')   return  c.is_active;
    if (filter === 'inactive') return !c.is_active;
    return true;
  });

  return (
    <div>
      <div className="search-bar">
        <Search size={17} color="var(--color-text-faint)" />
        <input
          placeholder="Search by name, mobile or ID (CUS-XXXX)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="tab-row">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`tab-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <SkeletonRows count={5} />}

      {!loading && visible.length === 0 && (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Start adding customers to begin tracking milk deliveries and payments."
          action={
            <button className="btn btn-primary" onClick={() => navigate('/customers/new')}>
              <Plus size={16} /> Add Customer
            </button>
          }
        />
      )}

      {visible.map((c, i) => (
        <motion.div
          key={c.id}
          className="customer-card"
          onClick={() => navigate(`/customers/${c.id}`)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
        >
          <div>
            {/* Name + status badges */}
            <div className="name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {c.name}
              {!c.is_active && <span className="badge badge-holiday">Archived</span>}
            </div>

            {/* Customer code + mobile */}
            <div className="meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {c.customer_code && (
                <span className="customer-code-tag">{c.customer_code}</span>
              )}
              <span>
                {c.mobile
                  ? c.mobile
                  : <span className="text-muted" style={{ fontStyle: 'italic' }}>No phone</span>}
              </span>
              <span>·</span>
              <span>{c.milk_type === 'buffalo' ? '🐃 Buffalo' : '🐄 Cow'}</span>
            </div>

            <div className="mt-12">
              {c.morning_enabled && <span className="shift-tag">Morning</span>}
              {c.evening_enabled && <span className="shift-tag">Evening</span>}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className={`balance ${c.current_balance > 0 ? 'text-danger' : 'text-success'}`}>
              {formatCurrency(Math.abs(c.current_balance || 0))}
            </div>
            <div className="text-sm text-muted">
              {c.current_balance > 0 ? 'due' : 'settled'}
            </div>
          </div>
        </motion.div>
      ))}

      <button className="fab" onClick={() => navigate('/customers/new')} aria-label="Add customer">
        <Plus size={24} />
      </button>
    </div>
  );
}
