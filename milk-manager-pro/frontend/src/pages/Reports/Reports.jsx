import { useEffect, useState } from 'react';
import { CheckCircle2, TrendingUp, Wallet } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { getOutstandingBalances, getLitresAndRevenue, getPaymentsSummary } from '../../services/reportService';
import { formatCurrency, formatLitres, todayISO } from '../../utils/format';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonRows, SkeletonCard } from '../../components/ui/Skeleton';

const TABS = [
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'litres', label: 'Litres & Revenue' },
  { key: 'collections', label: 'Collections' },
];

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Reports() {
  usePageHeader('Reports', 'Business insights and analytics');
  const [tab, setTab] = useState('outstanding');

  return (
    <div>
      <div className="tab-row">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'outstanding' && <OutstandingReport />}
      {tab === 'litres' && <LitresRevenueReport />}
      {tab === 'collections' && <CollectionsReport />}
    </div>
  );
}

function OutstandingReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOutstandingBalances().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <SkeletonCard />
        <SkeletonRows count={3} />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      <div className="card mb-12">
        <div className="text-sm text-muted">Total Outstanding</div>
        <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--color-danger)' }}>{formatCurrency(data.total_outstanding)}</div>
      </div>
      {data.rows.length === 0 && (
        <EmptyState icon={CheckCircle2} title="All settled up" description="No customers currently have an outstanding balance." />
      )}
      {data.rows.map((r) => (
        <div key={r.customer_id} className="customer-card" style={{ cursor: 'default' }}>
          <div>
            <div className="name">{r.name}</div>
            <div className="meta">{r.mobile}</div>
          </div>
          <div className={`balance ${r.balance > 0 ? 'text-danger' : 'text-success'}`}>
            {formatCurrency(Math.abs(r.balance))} {r.balance > 0 ? 'due' : 'advance'}
          </div>
        </div>
      ))}
    </div>
  );
}

function LitresRevenueReport() {
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = () => {
    setLoading(true);
    getLitresAndRevenue({ date_from: dateFrom, date_to: dateTo }).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="card mb-12">
        <div className="form-row">
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={fetchReport}>Apply</button>
      </div>

      {loading && (
        <div className="grid-cards">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}
      {data && !loading && (
        <div className="grid-cards">
          <div className="stat-card"><div className="stat-label">Total Litres</div><div className="stat-value">{formatLitres(data.total_litres)}</div></div>
          <div className="stat-card accent"><div className="stat-label">Extra Litres</div><div className="stat-value">{formatLitres(data.total_extra_litres)}</div></div>
          <div className="stat-card"><div className="stat-label">Revenue</div><div className="stat-value">{formatCurrency(data.total_revenue)}</div></div>
          <div className="stat-card danger"><div className="stat-label">Days Not Taken</div><div className="stat-value">{data.days_not_taken}</div></div>
        </div>
      )}
      {data && !loading && data.total_deliveries_recorded === 0 && (
        <EmptyState icon={TrendingUp} title="No deliveries in this range" description="Try a wider date range, or record some deliveries first." />
      )}
    </div>
  );
}

function CollectionsReport() {
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = () => {
    setLoading(true);
    getPaymentsSummary({ date_from: dateFrom, date_to: dateTo }).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="card mb-12">
        <div className="form-row">
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={fetchReport}>Apply</button>
      </div>

      {loading && <SkeletonCard />}

      {data && !loading && data.payment_count === 0 && (
        <EmptyState icon={Wallet} title="No payments in this range" description="Try a wider date range, or record a payment first." />
      )}

      {data && !loading && data.payment_count > 0 && (
        <>
          <div className="card mb-12">
            <div className="text-sm text-muted">Total Collected</div>
            <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--color-primary)' }}>{formatCurrency(data.total_collected)}</div>
            <div className="text-sm text-muted mt-12">{data.payment_count} payments</div>
          </div>
          <div className="card">
            <div className="section-title">By Method</div>
            {Object.entries(data.by_method).map(([method, amount]) => (
              <div key={method} className="flex-between mb-12">
                <span className="text-muted" style={{ textTransform: 'capitalize' }}>{method.replace('_', ' ')}</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
