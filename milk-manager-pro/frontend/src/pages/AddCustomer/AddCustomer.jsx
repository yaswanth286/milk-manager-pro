import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useToast } from '../../context/ToastContext';
import { createCustomer, getCustomer, updateCustomer, deleteCustomer } from '../../services/customerService';
import { todayISO } from '../../utils/format';

const QTY_PRESETS = [
  { label: '250 ml', value: '0.25' },
  { label: '500 ml', value: '0.5' },
  { label: '750 ml', value: '0.75' },
  { label: '1 L',   value: '1' },
];

function QtyPicker({ value, onChange }) {
  const isPreset = QTY_PRESETS.some((p) => p.value === value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {QTY_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1.5px solid',
              borderColor: value === p.value ? 'var(--color-primary)' : 'var(--color-border)',
              background: value === p.value ? 'var(--color-primary)' : 'transparent',
              color: value === p.value ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: value === p.value ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number"
          step="0.05"
          min="0"
          className="form-control"
          placeholder="Other (e.g. 1.5)"
          value={isPreset ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          style={{ maxWidth: '160px' }}
        />
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>litres</span>
      </div>
    </div>
  );
}

const emptyForm = {
  name: '',
  mobile: '',
  address: '',
  milk_type: 'buffalo',
  price_per_litre: '',
  start_date: todayISO(),
  morning_enabled: false,
  morning_default_qty: '',
  evening_enabled: false,
  evening_default_qty: '',
  previous_balance: '0',
  advance_amount: '0',
  is_active: true,
  notes: '',
  customer_code: '',
};

export default function AddCustomer() {
  const { id } = useParams(); // 'new' or a numeric id
  const isEdit = id && id !== 'new';
  const navigate = useNavigate();
  const toast = useToast();
  usePageHeader(isEdit ? 'Edit Customer' : 'Add Customer', isEdit ? 'Update delivery details and pricing' : 'Add a new customer to your delivery list');

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    getCustomer(id)
      .then((c) =>
        setForm({
          ...c,
          price_per_litre: String(c.price_per_litre),
          morning_default_qty: String(c.morning_default_qty),
          evening_default_qty: String(c.evening_default_qty),
          previous_balance: String(c.previous_balance),
          advance_amount: String(c.advance_amount),
          notes: c.notes || '',
          address: c.address || '',
          mobile: c.mobile || '',
          customer_code: c.customer_code || '',
        })
      )
      .catch(() => setError('Could not load customer.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

  if (!form.name.trim()) {
  setError('Customer name is required.');
  return;
}
    if (!form.morning_enabled && !form.evening_enabled) {
      setError('Please enable at least one delivery shift (Morning and/or Evening).');
      return;
    }

    const payload = {
      ...form,
      price_per_litre: Number(form.price_per_litre) || 0,
      morning_default_qty: form.morning_enabled ? Number(form.morning_default_qty) || 0 : 0,
      evening_default_qty: form.evening_enabled ? Number(form.evening_default_qty) || 0 : 0,
      previous_balance: Number(form.previous_balance) || 0,
      advance_amount: Number(form.advance_amount) || 0,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateCustomer(id, payload);
        toast.success('Customer updated successfully');
        navigate(`/customers/${id}`);
      } else {
        const created = await createCustomer(payload);
        toast.success('Customer added successfully');
        navigate(`/customers/${created.id}`);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Unable to save customer. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Archive ${form.name}? They will be marked inactive. All their delivery, payment and billing history is preserved.`)) return;
    try {
      await deleteCustomer(id);
      toast.success('Customer archived');
      navigate('/customers');
    } catch {
      toast.error('Unable to archive customer. Please try again.');
    }
  };

  if (loading) {
    return <div className="text-muted">Loading...</div>;
  }

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="section-title">Basic Details</div>

          {/* Show auto-generated customer ID in edit mode */}
          {isEdit && form.customer_code && (
            <div className="form-group">
              <label>Customer ID</label>
              <div className="form-control" style={{
                background: 'var(--color-surface-alt)',
                color: 'var(--color-text-muted)',
                cursor: 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span className="customer-code-tag">{form.customer_code}</span>
                <span style={{ fontSize: '0.8rem' }}>Auto-generated · cannot be changed</span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Customer Name *</label>
            <input className="form-control" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>

          <div className="form-group">
            <label>
              Mobile Number{' '}
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                (Optional)
              </span>
            </label>
            <input
              type="tel"
              className="form-control"
              placeholder="e.g. 9876543210"
              value={form.mobile}
              onChange={(e) => setField('mobile', e.target.value)}
            />
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-faint)', marginTop: 4 }}>
              When provided, the customer can log in using this number.
            </div>
          </div>

          <div className="form-group">
            <label>Address</label>
            <textarea className="form-control" value={form.address} onChange={(e) => setField('address', e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Milk Type</label>
              <select className="form-control" value={form.milk_type} onChange={(e) => setField('milk_type', e.target.value)}>
                <option value="buffalo">🐃 Buffalo</option>
                <option value="cow">🐄 Cow</option>
              </select>
            </div>
            <div className="form-group">
              <label>Price per Litre (₹)</label>
              <input
                type="number" step="0.5" className="form-control"
                value={form.price_per_litre}
                onChange={(e) => setField('price_per_litre', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Start Date</label>
            <input type="date" className="form-control" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
          </div>
        </div>

        <div className="card">
          <div className="section-title">Delivery Schedule</div>

          <div className="checkbox-row">
            <input
              type="checkbox"
              checked={form.morning_enabled}
              onChange={(e) => setField('morning_enabled', e.target.checked)}
              id="morning_enabled"
            />
            <label htmlFor="morning_enabled" style={{ margin: 0 }}>Morning Delivery</label>
          </div>
          {form.morning_enabled && (
            <div className="form-group">
              <label>Morning Quantity</label>
              <QtyPicker
                value={form.morning_default_qty}
                onChange={(v) => setField('morning_default_qty', v)}
              />
            </div>
          )}

          <div className="checkbox-row">
            <input
              type="checkbox"
              checked={form.evening_enabled}
              onChange={(e) => setField('evening_enabled', e.target.checked)}
              id="evening_enabled"
            />
            <label htmlFor="evening_enabled" style={{ margin: 0 }}>Evening Delivery</label>
          </div>
          {form.evening_enabled && (
            <div className="form-group">
              <label>Evening Quantity</label>
              <QtyPicker
                value={form.evening_default_qty}
                onChange={(v) => setField('evening_default_qty', v)}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">Balance</div>
          <div className="form-row">
            <div className="form-group">
              <label>Previous Balance (₹)</label>
              <input type="number" step="1" className="form-control" value={form.previous_balance} onChange={(e) => setField('previous_balance', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Advance Paid (₹)</label>
              <input type="number" step="1" className="form-control" value={form.advance_amount} onChange={(e) => setField('advance_amount', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="checkbox-row">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} id="is_active" />
            <label htmlFor="is_active" style={{ margin: 0 }}>Active customer</label>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Customer'}
        </button>

        {isEdit && (
          <button type="button" className="btn btn-danger btn-block mt-12" onClick={handleDelete}>
            Archive Customer
          </button>
        )}
      </form>
    </div>
  );
}
