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
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

export default function Customers() {
  usePageHeader('Customers', 'Manage your delivery list and balances');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

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
    // Keep the URL in sync so the topbar's global search (which navigates
    // here with ?search=) and typing directly in this page's search box
    // both work the same way.
    if (search) setSearchParams({ search }, { replace: true });
    else setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const visibleCustomers = customers.filter((c) => {
    if (filter === 'active') return c.is_active;
    if (filter === 'inactive') return !c.is_active;
    return true;
  });

  return (
    <div>
      <div className="search-bar">
        <Search size={17} color="var(--color-text-faint)" />
        <input
          placeholder="Search by name or mobile number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="tab-row">
        {FILTERS.map((f) => (
          <button key={f.key} className={`tab-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <SkeletonRows count={5} />}

      {!loading && visibleCustomers.length === 0 && (
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

      {visibleCustomers.map((c, i) => (
        <motion.div
          key={c.id}
          className="customer-card"
          onClick={() => navigate(`/customers/${c.id}`)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
        >
          <div>
            <div className="name">{c.name} {!c.is_active && <span className="badge badge-holiday">Inactive</span>}</div>
            <div className="meta">
              {c.mobile} · {c.milk_type === 'buffalo' ? '🐃 Buffalo' : '🐄 Cow'}
            </div>
            <div className="mt-12">
              {c.morning_enabled && <span className="shift-tag">Morning</span>}
              {c.evening_enabled && <span className="shift-tag">Evening</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={`balance ${c.current_balance > 0 ? 'text-danger' : 'text-success'}`}>
              {formatCurrency(Math.abs(c.current_balance || 0))}
            </div>
            <div className="text-sm text-muted">{c.current_balance > 0 ? 'due' : 'settled'}</div>
          </div>
        </motion.div>
      ))}

      <button className="fab" onClick={() => navigate('/customers/new')} aria-label="Add customer">
        <Plus size={24} />
      </button>
    </div>
  );
}
