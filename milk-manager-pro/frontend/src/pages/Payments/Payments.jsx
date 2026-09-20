import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Wallet, Banknote, Smartphone, Landmark, CircleDollarSign } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useToast } from '../../context/ToastContext';
import { listPayments, createPayment } from '../../services/paymentService';
import { listCustomers } from '../../services/customerService';
import { formatCurrency, formatDateDisplay, todayISO } from '../../utils/format';
import { PAYMENT_METHODS } from '../../constants';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Skeleton';

const METHOD_ICONS = { cash: Banknote, upi: Smartphone, bank_transfer: Landmark, other: CircleDollarSign };

function methodLabel(method) {
  const map = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer', other: 'Other' };
  return map[method] || method;
}

export default function Payments() {
  usePageHeader('Payments', 'Track and record customer payments');
  const [searchParams] = useSearchParams();
  const preselectedCustomer = searchParams.get('customer_id');
  const showForm = searchParams.get('new') !== null || !!preselectedCustomer;
  const navigate = useNavigate();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(!!showForm);

  const refresh = () => {
    setLoading(true);
    listPayments({}).then(setPayments).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const todaysCollected = payments.filter((p) => p.date === todayISO()).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <div className="kpi-grid mb-12" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="kpi-card">
          <div className="kpi-icon"><Wallet size={18} /></div>
          <div className="kpi-label">Total Collected</div>
          <div className="kpi-value">{formatCurrency(totalCollected)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><CircleDollarSign size={18} /></div>
          <div className="kpi-label">Today's Collection</div>
          <div className="kpi-value">{formatCurrency(todaysCollected)}</div>
        </div>
      </div>

      <button className="btn btn-primary btn-block mb-12" onClick={() => setFormOpen(true)}>
        <Plus size={16} /> New Payment
      </button>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); navigate('/payments', { replace: true }); }} title="Record New Payment">
        <PaymentForm
          preselectedCustomer={preselectedCustomer}
          onSaved={() => {
            setFormOpen(false);
            navigate('/payments', { replace: true });
            refresh();
          }}
        />
      </Modal>

      <div className="section-title">Payment History</div>
      {loading && <SkeletonRows count={4} />}
      {!loading && payments.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No payments recorded yet"
          description="Payments you record will show up here, and automatically reduce each customer's balance."
          action={<button className="btn btn-primary" onClick={() => setFormOpen(true)}><Plus size={16} /> New Payment</button>}
        />
      )}
      {payments.map((p, i) => {
        const Icon = METHOD_ICONS[p.method] || CircleDollarSign;
        return (
          <motion.div
            key={p.id}
            className="customer-card"
            style={{ cursor: 'default' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
          >
            <div className="flex-gap">
              <div className="activity-dot"><Icon size={15} /></div>
              <div>
                <div className="name">{p.customer_name}</div>
                <div className="meta">{formatDateDisplay(p.date)} · {methodLabel(p.method)}</div>
                {p.notes && <div className="text-sm text-muted mt-12">{p.notes}</div>}
              </div>
            </div>
            <div className="balance text-success">{formatCurrency(p.amount)}</div>
          </motion.div>
        );
      })}
    </div>
  );
}

function PaymentForm({ preselectedCustomer, onSaved }) {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customer_id: preselectedCustomer || '',
    date: todayISO(),
    amount: '',
    method: 'cash',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCustomers('', true).then(setCustomers);
  }, []);

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.customer_id || !form.amount || Number(form.amount) <= 0) {
      setError('Please select a customer and enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await createPayment({
        customer_id: Number(form.customer_id),
        date: form.date,
        amount: Number(form.amount),
        method: form.method,
        notes: form.notes || null,
      });
      toast.success('Payment recorded successfully');
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Unable to record payment. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}
      <div className="form-group">
        <label>Customer *</label>
        <select className="form-control" value={form.customer_id} onChange={(e) => setField('customer_id', e.target.value)} required>
          <option value="">Select customer...</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Amount (₹) *</label>
          <input type="number" step="1" className="form-control" value={form.amount} onChange={(e) => setField('amount', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" className="form-control" value={form.date} onChange={(e) => setField('date', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label>Payment Method</label>
        <select className="form-control" value={form.method} onChange={(e) => setField('method', e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Notes</label>
        <input className="form-control" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving...' : 'Save Payment'}
      </button>
    </form>
  );
}
