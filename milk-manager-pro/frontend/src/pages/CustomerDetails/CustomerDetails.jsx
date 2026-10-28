import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Pencil, CreditCard, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';
import { getCustomer, getCustomerConsumption } from '../../services/customerService';
import { formatCurrency, formatLitres, formatDateShort } from '../../utils/format';
import { MONTH_NAMES, STATUS_LABELS } from '../../constants';
import { SkeletonText, SkeletonCard } from '../../components/ui/Skeleton';

export default function CustomerDetails() {
  const { id: paramId } = useParams();
  const { user } = useAuth();
  const isCustomerView = user?.role === 'customer';
  const id = isCustomerView ? user.customer_id : paramId;
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [customer, setCustomer] = useState(null);
  const [consumption, setConsumption] = useState(null);
  const [loading, setLoading] = useState(true);

  usePageHeader(
    isCustomerView ? 'My milk' : (customer?.name || 'Customer Details'),
    isCustomerView
      ? (customer ? `Customer since ${customer.start_date}` : 'Your deliveries, balance, and history')
      : (customer ? `Customer since ${customer.start_date}` : '')
  );

  useEffect(() => {
    if (!id) return;
    getCustomer(id).then(setCustomer);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCustomerConsumption(id, year, month)
      .then(setConsumption)
      .finally(() => setLoading(false));
  }, [id, year, month]);

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  };

  if (!customer) {
    return (
      <div className="card">
        <SkeletonText lines={2} width="50%" />
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="flex-between">
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.01em' }}>{customer.name}</div>
            <div className="text-sm text-muted">{customer.mobile} · {customer.milk_type === 'buffalo' ? '🐃 Buffalo' : '🐄 Cow'}</div>
          </div>
          {!isCustomerView && (
            <button className="btn btn-outline btn-sm" onClick={() => navigate(`/customers/${id}/edit`)}>
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>

        <div className="mt-16" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {customer.morning_enabled && (
            <div><span className="shift-tag">Morning</span> {formatLitres(customer.morning_default_qty)}</div>
          )}
          {customer.evening_enabled && (
            <div><span className="shift-tag">Evening</span> {formatLitres(customer.evening_default_qty)}</div>
          )}
          <div className="text-sm text-muted">Rate: ₹{customer.price_per_litre}/L</div>
        </div>

        <div className="mt-16 flex-between">
          <div>
            <div className="text-sm text-muted">Current Balance</div>
            <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }} className={customer.current_balance > 0 ? 'text-danger' : 'text-success'}>
              {formatCurrency(Math.abs(customer.current_balance || 0))} {customer.current_balance > 0 ? 'due' : 'settled'}
            </div>
          </div>
          {!isCustomerView && (
            <Link to={`/payments/new?customer_id=${id}`} className="btn btn-accent btn-sm">
              <CreditCard size={14} /> Record Payment
            </Link>
          )}
        </div>
      </div>

      <div className="date-nav">
        <button onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 700 }}>{MONTH_NAMES[month - 1]} {year}</div>
        <button onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button>
      </div>

      {loading && (
        <div className="grid-cards mb-12">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}

      {consumption && !loading && (
        <>
          <div className="grid-cards mb-12">
            <div className="stat-card"><div className="stat-label">Morning Total</div><div className="stat-value">{formatLitres(consumption.total_morning_litres)}</div></div>
            <div className="stat-card"><div className="stat-label">Evening Total</div><div className="stat-value">{formatLitres(consumption.total_evening_litres)}</div></div>
            <div className="stat-card accent"><div className="stat-label">Extra Litres</div><div className="stat-value">{formatLitres(consumption.total_extra_litres)}</div></div>
            <div className="stat-card danger"><div className="stat-label">Not Taken Days</div><div className="stat-value">{consumption.total_not_taken_days}</div></div>
          </div>

          <div className="card mb-12">
            <Link to={isCustomerView ? `/bills?year=${year}&month=${month}` : `/bills?customer_id=${id}&year=${year}&month=${month}`} className="btn btn-primary btn-block">
              <Receipt size={16} /> {isCustomerView ? `View bill for ${MONTH_NAMES[month - 1]}` : `View / Generate Bill for ${MONTH_NAMES[month - 1]}`}
            </Link>
          </div>

          <div className="section-title">Daily Consumption</div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Morning</th>
                  <th>Evening</th>
                  <th>Status</th>
                  <th>Extra</th>
                </tr>
              </thead>
              <tbody>
                {consumption.daily_rows.length === 0 && (
                  <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>No records for this month yet.</td></tr>
                )}
                {consumption.daily_rows.map((row) => (
                  <tr key={row.date}>
                    <td>{formatDateShort(row.date)}</td>
                    <td>{row.morning ? formatLitres(row.morning) : '-'}</td>
                    <td>{row.evening ? formatLitres(row.evening) : '-'}</td>
                    <td>
                      {row.status_morning && <span className={`badge badge-${row.status_morning}`}>{STATUS_LABELS[row.status_morning]}</span>}
                      {row.status_evening && row.status_evening !== row.status_morning && (
                        <span className={`badge badge-${row.status_evening}`} style={{ marginLeft: 4 }}>{STATUS_LABELS[row.status_evening]}</span>
                      )}
                    </td>
                    <td>{row.extra > 0 ? formatLitres(row.extra) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
