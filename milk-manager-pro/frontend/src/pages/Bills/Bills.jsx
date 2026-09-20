import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Receipt, Printer, Save, CheckCircle2 } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useToast } from '../../context/ToastContext';
import { listCustomers } from '../../services/customerService';
import { getBill, generateBill, getAllBills, generateAllBills } from '../../services/billService';
import { formatCurrency, formatLitres, formatDateShort } from '../../utils/format';
import { MONTH_NAMES } from '../../constants';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function Bills() {
  usePageHeader('Bills', 'Generate and print monthly milk bills');
  const [searchParams] = useSearchParams();
  const now = new Date();

  // 'single' = one customer's full bill (with daily table).
  // 'all'    = every customer's bill at once, as compact printable slips
  //            you can cut apart and hand out.
  const [mode, setMode] = useState('single');

  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') || '');
  const [year, setYear] = useState(Number(searchParams.get('year')) || now.getFullYear());
  const [month, setMonth] = useState(Number(searchParams.get('month')) || now.getMonth() + 1);

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
            <select className="form-control" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
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

      {mode === 'single' ? (
        <SingleBill customerId={customerId} year={year} month={month} />
      ) : (
        <AllBills year={year} month={month} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SINGLE CUSTOMER MODE                                                 */
/* ------------------------------------------------------------------ */

function SingleBill({ customerId, year, month }) {
  const toast = useToast();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!customerId) { setBill(null); return; }
    setLoading(true);
    setError('');
    setGenerated(false);
    getBill(customerId, year, month)
      .then(setBill)
      .catch(() => setError('Unable to calculate bill. Please try again.'))
      .finally(() => setLoading(false));
  }, [customerId, year, month]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const b = await generateBill(customerId, year, month);
      setBill(b);
      setGenerated(true);
      toast.success('Bill saved as final');
    } catch {
      setError('Unable to generate bill. Please try again.');
      toast.error('Unable to generate bill. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!customerId) {
    return (
      <EmptyState icon={Receipt} title="Select a customer" description="Choose a customer and month above to view their bill." />
    );
  }

  return (
    <div>
      {loading && <SkeletonCard />}
      {error && <div className="form-error">{error}</div>}

      {bill && !loading && (
        <>
          <div className="card mb-12 no-print flex-gap" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate}>
              {generated ? <CheckCircle2 size={14} /> : <Save size={14} />} {generated ? 'Saved as Final Bill' : 'Save as Final Bill'}
            </button>
          </div>

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
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16 }} className="text-muted">No deliveries recorded this month.</td></tr>
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
/* ALL CUSTOMERS MODE - one printable slip per customer                 */
/* ------------------------------------------------------------------ */

function AllBills({ year, month }) {
  const toast = useToast();
  const [bills, setBills] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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

  const handleGenerateAll = async () => {
    if (!confirm(`Save ${bills.length} bills for ${MONTH_NAMES[month - 1]} ${year} as final? This freezes them permanently.`)) return;
    setSaving(true);
    try {
      const results = await generateAllBills(year, month);
      setBills(results);
      setSavedCount(results.length);
      toast.success(`Saved ${results.length} bills as final`);
    } catch {
      setError('Unable to save bills. Please try again.');
      toast.error('Unable to save bills. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonCard />;
  if (error) return <div className="form-error">{error}</div>;

  return (
    <div>
      <div className="card mb-12 no-print flex-between">
        <div className="text-sm text-muted">
          {bills.length} bill{bills.length !== 1 ? 's' : ''} for {MONTH_NAMES[month - 1]} {year}
          {savedCount != null && <div className="text-success" style={{ marginTop: 4 }}>✓ Saved {savedCount} as final bills</div>}
        </div>
        <div className="flex-gap">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={14} /> Print All</button>
          <button className="btn btn-primary btn-sm" onClick={handleGenerateAll} disabled={saving || bills.length === 0}>
            {saving ? 'Saving...' : 'Save All as Final'}
          </button>
        </div>
      </div>

      {bills.length === 0 && (
        <EmptyState icon={Receipt} title="Nothing to bill yet" description="No customers have activity or balance for this month yet." />
      )}

      <div className="bill-slip-grid">
        {bills.map((bill) => (
          <BillSlip key={bill.customer_id} bill={bill} />
        ))}
      </div>
    </div>
  );
}

/* A compact, cut-friendly version of a bill - no daily table, just the
   numbers a customer needs to see. Designed to print 2-up with a dashed
   cut line between slips (see the "bill-slip" CSS rules in global.css). */
function BillSlip({ bill }) {
  return (
    <div className="bill-slip">
      <BillHeader bill={bill} compact />
      <div className="text-sm mb-12">
        <span className="shift-tag">M {formatLitres(bill.morning_total)}</span>
        <span className="shift-tag">E {formatLitres(bill.evening_total)}</span>
        {bill.extra_total > 0 && <span className="shift-tag">Extra {formatLitres(bill.extra_total)}</span>}
      </div>
      <BillTotalsTable bill={bill} compact />
      <div className="text-sm text-muted mt-12">
        Delivered {bill.days_delivered}d · Not Taken {bill.days_not_taken}d
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                        */
/* ------------------------------------------------------------------ */

function BillHeader({ bill, compact }) {
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: compact ? 8 : 16 }}>
        <div style={{ fontSize: compact ? '1rem' : '1.3rem', fontWeight: 800, color: 'var(--color-primary-dark)' }}>🥛 Milk Manager Pro</div>
        {!compact && <div className="text-sm text-muted">Monthly Milk Bill</div>}
      </div>
      <div className="flex-between mb-12">
        <div>
          <div style={{ fontWeight: 700 }}>{bill.customer_name}</div>
          <div className="text-sm text-muted">{bill.mobile}</div>
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
            <td>{compact ? 'Milk Charges' : `Milk Charges (${formatLitres(bill.total_litres)} × ₹${bill.rate_applied})`}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(bill.milk_charges)}</td>
          </tr>
          <tr><td>Opening Balance</td><td style={{ textAlign: 'right' }}>{formatCurrency(bill.opening_balance)}</td></tr>
          <tr><td>Payments This Month</td><td style={{ textAlign: 'right', color: 'var(--color-success)' }}>− {formatCurrency(bill.payments_during_month)}</td></tr>
          <tr style={{ background: 'var(--color-primary-light)' }}>
            <td style={{ fontWeight: 800 }}>Closing Balance</td>
            <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCurrency(bill.closing_balance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
