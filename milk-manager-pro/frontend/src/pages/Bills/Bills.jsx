import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Receipt, Printer, Save, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useToast } from '../../context/ToastContext';
import { listCustomers } from '../../services/customerService';
import { getBill, generateBill, getAllBills, generateAllBills, reopenBill } from '../../services/billService';
import { formatCurrency, formatLitres, formatDateShort } from '../../utils/format';
import { MONTH_NAMES } from '../../constants';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';

/* ------------------------------------------------------------------ */
/* Status helpers                                                        */
/* ------------------------------------------------------------------ */

function BillStatusBadge({ status }) {
  if (!status) return null;
  const map = {
    finalized: { label: 'Finalized', cls: 'badge-delivered' },
    draft:     { label: 'Draft',     cls: 'badge-pending'   },
    reopened:  { label: 'Reopened',  cls: 'badge-not_taken' },
  };
  const { label, cls } = map[status] || { label: status, cls: '' };
  return <span className={`badge ${cls}`} style={{ marginLeft: 8 }}>{label}</span>;
}

/* ------------------------------------------------------------------ */
/* Main page                                                             */
/* ------------------------------------------------------------------ */

export default function Bills() {
  usePageHeader('Bills', 'Generate and print monthly milk bills');
  const [searchParams] = useSearchParams();
  const now = new Date();

  const [mode,       setMode]       = useState('single');
  const [customers,  setCustomers]  = useState([]);
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') || '');
  const [year,       setYear]       = useState(Number(searchParams.get('year'))  || now.getFullYear());
  const [month,      setMonth]      = useState(Number(searchParams.get('month')) || now.getMonth() + 1);

  const years = [now.getFullYear(), now.getFullYear() - 1];

  useEffect(() => {
    listCustomers('', true).then(setCustomers);
  }, []);

  return (
    <div>
      <div className="tab-row no-print">
        <button className={`tab-btn ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
          <User size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Single Customer
        </button>
        <button className={`tab-btn ${mode === 'all' ? 'active' : ''}`} onClick={() => setMode('all')}>
          <Receipt size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> All Customers
        </button>
      </div>

      <div className="card mb-12 no-print">
        {mode === 'single' && (
          <div className="form-group">
            <label>Customer</label>
            <select
              className="form-control"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.customer_code ? ` (${c.customer_code})` : ''}{c.mobile ? ` · ${c.mobile}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Month</label>
            <select className="form-control" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Year</label>
            <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {mode === 'single'
        ? <SingleBill customerId={customerId} year={year} month={month} />
        : <AllBills   year={year} month={month} />
      }
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SINGLE CUSTOMER MODE                                                 */
/* ------------------------------------------------------------------ */

function SingleBill({ customerId, year, month }) {
  const toast = useToast();
  const [bill,    setBill]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Reopen modal state
  const [reopenOpen,   setReopenOpen]   = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening,    setReopening]    = useState(false);

  useEffect(() => {
    if (!customerId) { setBill(null); return; }
    setLoading(true);
    setError('');
    getBill(customerId, year, month)
      .then(setBill)
      .catch(() => setError('Unable to calculate bill. Please try again.'))
      .finally(() => setLoading(false));
  }, [customerId, year, month]);

  const handleFinalize = async () => {
    setLoading(true);
    try {
      const b = await generateBill(customerId, year, month);
      setBill(b);
      toast.success('Bill finalized');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Unable to finalize bill.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      toast.error('Please enter a reason to reopen this bill.');
      return;
    }
    setReopening(true);
    try {
      const b = await reopenBill(customerId, year, month, reopenReason.trim());
      setBill(b);
      setReopenOpen(false);
      setReopenReason('');
      toast.success('Bill reopened — you can now regenerate it.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Unable to reopen bill.');
    } finally {
      setReopening(false);
    }
  };

  if (!customerId) {
    return (
      <EmptyState
        icon={Receipt}
        title="Select a customer"
        description="Choose a customer and month above to view their bill."
      />
    );
  }

  const isFinalized = bill?.status === 'finalized';
  const isReopened  = bill?.status === 'reopened';

  return (
    <div>
      {loading && <SkeletonCard />}
      {error   && <div className="form-error">{error}</div>}

      {bill && !loading && (
        <>
          {/* Action bar */}
          <div className="card mb-12 no-print flex-gap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="text-sm text-muted">Status</span>
              <BillStatusBadge status={bill.status} />
              {isFinalized && bill.finalized_at && (
                <span className="text-sm text-muted">
                  · Finalized {new Date(bill.finalized_at).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>
            <div className="flex-gap">
              <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
                <Printer size={14} /> Print
              </button>
              {isFinalized ? (
                <button className="btn btn-outline btn-sm" onClick={() => setReopenOpen(true)}>
                  <Unlock size={14} /> Reopen
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={handleFinalize}>
                  <Save size={14} />
                  {isReopened ? 'Re-finalize Bill' : 'Finalize Bill'}
                </button>
              )}
            </div>
          </div>

          {/* Finalized immutability notice */}
          {isFinalized && (
            <div className="form-info mb-12">
              <Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              This bill is finalized and locked. The numbers below are the official snapshot.
              Only the owner can reopen it.
            </div>
          )}

          {/* Reopen reason dialog */}
          {reopenOpen && (
            <div className="card mb-12" style={{ border: '1.5px solid var(--color-warning)', background: 'var(--color-warning-bg)' }}>
              <div className="section-title" style={{ color: 'var(--color-warning)', marginBottom: 10 }}>
                Reopen Finalized Bill
              </div>
              <div className="text-sm text-muted mb-12">
                This will unlock the bill so it can be recalculated. Please provide a reason (required for audit trail).
              </div>
              <textarea
                className="form-control mb-12"
                rows={2}
                placeholder="e.g. Correcting a delivery entry for 15th…"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
              <div className="flex-gap">
                <button className="btn btn-danger btn-sm" onClick={handleReopen} disabled={reopening}>
                  {reopening ? 'Reopening…' : 'Confirm Reopen'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => { setReopenOpen(false); setReopenReason(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <BillHeader bill={bill} />

            <div className="grid-cards mb-12" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div className="stat-card"><div className="stat-label">Morning</div><div className="stat-value">{formatLitres(bill.morning_total)}</div></div>
              <div className="stat-card"><div className="stat-label">Evening</div><div className="stat-value">{formatLitres(bill.evening_total)}</div></div>
              <div className="stat-card accent"><div className="stat-label">Extra</div><div className="stat-value">{formatLitres(bill.extra_total)}</div></div>
              <div className="stat-card"><div className="stat-label">Total Litres</div><div className="stat-value">{formatLitres(bill.total_litres)}</div></div>
            </div>

            <BillTotalsTable bill={bill} />

            <div className="text-sm text-muted mb-12">
              Days Delivered: {bill.days_delivered} · Days Not Taken: {bill.days_not_taken}
            </div>

            <div className="section-title">Daily Consumption</div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Morning</th><th>Evening</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {bill.daily_rows.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 16 }} className="text-muted">
                        No deliveries recorded this month.
                      </td>
                    </tr>
                  )}
                  {bill.daily_rows.map((r) => (
                    <tr key={r.date}>
                      <td>{formatDateShort(r.date)}</td>
                      <td>{r.morning ? formatLitres(r.morning) : '-'}</td>
                      <td>{r.evening ? formatLitres(r.evening) : '-'}</td>
                      <td style={{ fontWeight: 700 }}>{formatLitres(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ALL CUSTOMERS MODE                                                    */
/* ------------------------------------------------------------------ */

function AllBills({ year, month }) {
  const toast = useToast();
  const [bills,      setBills]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setSavedCount(null);
    getAllBills(year, month)
      .then(setBills)
      .catch(() => setError('Unable to load bills. Please try again.'))
      .finally(() => setLoading(false));
  }, [year, month]);

  const handleFinalizeAll = async () => {
    const pending = bills.filter((b) => b.status !== 'finalized').length;
    if (!confirm(
      `Finalize ${pending} bill(s) for ${MONTH_NAMES[month - 1]} ${year}? ` +
      `Already-finalized bills will be skipped.`
    )) return;
    setSaving(true);
    try {
      const results = await generateAllBills(year, month);
      setBills(results);
      setSavedCount(results.filter((b) => b.status === 'finalized').length);
      toast.success(`${results.length} bills finalized`);
    } catch {
      setError('Unable to finalize bills. Please try again.');
      toast.error('Unable to finalize bills.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error)   return <div className="form-error">{error}</div>;

  const finalizedCount = bills.filter((b) => b.status === 'finalized').length;
  const pendingCount   = bills.length - finalizedCount;

  return (
    <div>
      <div className="card mb-12 no-print flex-between">
        <div className="text-sm text-muted">
          {bills.length} bill{bills.length !== 1 ? 's' : ''} for {MONTH_NAMES[month - 1]} {year}
          {' · '}<span style={{ color: 'var(--color-success)' }}>{finalizedCount} finalized</span>
          {pendingCount > 0 && <span>, {pendingCount} pending</span>}
          {savedCount != null && (
            <div className="text-success" style={{ marginTop: 4 }}>
              <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              {savedCount} bill{savedCount !== 1 ? 's' : ''} finalized
            </div>
          )}
        </div>
        <div className="flex-gap">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Printer size={14} /> Print All
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleFinalizeAll}
            disabled={saving || pendingCount === 0}
          >
            {saving ? 'Finalizing…' : `Finalize ${pendingCount > 0 ? pendingCount : 'All'}`}
          </button>
        </div>
      </div>

      {bills.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="Nothing to bill yet"
          description="No customers have activity or balance for this month yet."
        />
      )}

      <div className="bill-slip-grid">
        {bills.map((bill) => (
          <BillSlip key={bill.customer_id} bill={bill} />
        ))}
      </div>
    </div>
  );
}

function BillSlip({ bill }) {
  return (
    <div className="bill-slip">
      <BillHeader bill={bill} compact />
      <div className="text-sm mb-12">
        <span className="shift-tag">M {formatLitres(bill.morning_total)}</span>
        <span className="shift-tag">E {formatLitres(bill.evening_total)}</span>
        {bill.extra_total > 0 && <span className="shift-tag">Extra {formatLitres(bill.extra_total)}</span>}
        <BillStatusBadge status={bill.status} />
      </div>
      <BillTotalsTable bill={bill} compact />
      <div className="text-sm text-muted mt-12">
        Delivered {bill.days_delivered}d · Not Taken {bill.days_not_taken}d
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                         */
/* ------------------------------------------------------------------ */

function BillHeader({ bill, compact }) {
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: compact ? 8 : 16 }}>
        <div style={{ fontSize: compact ? '1rem' : '1.3rem', fontWeight: 800, color: 'var(--color-primary-dark)' }}>
          🥛 Milk Manager Pro
        </div>
        {!compact && <div className="text-sm text-muted">Monthly Milk Bill</div>}
      </div>
      <div className="flex-between mb-12">
        <div>
          <div style={{ fontWeight: 700 }}>{bill.customer_name}</div>
          {bill.customer_code && (
            <div><span className="customer-code-tag">{bill.customer_code}</span></div>
          )}
          <div className="text-sm text-muted">
            {bill.mobile || <span style={{ fontStyle: 'italic' }}>No phone</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>{MONTH_NAMES[bill.month - 1]} {bill.year}</div>
          <div className="text-sm text-muted">Rate: ₹{bill.rate_applied}/L</div>
        </div>
      </div>
    </>
  );
}

function BillTotalsTable({ bill, compact }) {
  return (
    <div className="table-scroll mb-12">
      <table className="data-table">
        <tbody>
          <tr>
            <td>
              {compact
                ? 'Milk Charges'
                : `Milk Charges (${formatLitres(bill.total_litres)} × ₹${bill.rate_applied})`}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>
              {formatCurrency(bill.milk_charges)}
            </td>
          </tr>
          <tr>
            <td>Opening Balance</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(bill.opening_balance)}</td>
          </tr>
          <tr>
            <td>Payments This Month</td>
            <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>
              − {formatCurrency(bill.payments_during_month)}
            </td>
          </tr>
          <tr style={{ background: 'var(--color-primary-light)' }}>
            <td style={{ fontWeight: 800 }}>Closing Balance</td>
            <td style={{ textAlign: 'right', fontWeight: 800 }}>
              {formatCurrency(bill.closing_balance)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
