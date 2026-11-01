import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useToast } from '../../context/ToastContext';
import {
  createCustomer, getCustomer, updateCustomer, deleteCustomer,
  permanentDeleteCustomer, getCustomerRecordSummary,
} from '../../services/customerService';
import { repairDeliveryRates } from '../../services/deliveryService';
import { todayISO } from '../../utils/format';

/* ── Quantity preset chips ────────────────────────────────────────── */

const QTY_PRESETS = [
  { label: '250 ml',  value: '0.25'  },
  { label: '375 ml',  value: '0.375' },
  { label: '500 ml',  value: '0.5'   },
  { label: '625 ml',  value: '0.625' },
  { label: '750 ml',  value: '0.75'  },
  { label: '1 L',     value: '1'     },
  { label: '1.25 L',  value: '1.25'  },
  { label: '1.5 L',   value: '1.5'   },
  { label: '1.75 L',  value: '1.75'  },
  { label: '2 L',     value: '2'     },
];

function QtyPicker({ value, onChange }) {
  const numVal  = Number(value) || 0;
  const isPreset = QTY_PRESETS.some((p) => Number(p.value) === numVal && value !== '');
  const inputRef = React.useRef(null);

  // Prevent mouse-wheel from silently changing the quantity
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const block = (e) => e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Preset chips — 2 rows on mobile, wraps naturally */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {QTY_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            style={{
              padding: '5px 11px',
              borderRadius: 20,
              border: '1.5px solid',
              borderColor:
                Number(value) === Number(p.value) && value !== ''
                  ? 'var(--color-primary)'
                  : 'var(--color-border)',
              background:
                Number(value) === Number(p.value) && value !== ''
                  ? 'var(--color-primary)'
                  : 'transparent',
              color:
                Number(value) === Number(p.value) && value !== ''
                  ? '#fff'
                  : 'inherit',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: Number(value) === Number(p.value) && value !== '' ? 700 : 400,
              transition: 'all 0.12s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Free-entry input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="0.001"
          min="0"
          className="form-control qty-safe-input"
          placeholder="Other (e.g. 1.3)"
          value={isPreset ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          style={{ maxWidth: 160 }}
        />
        <span className="text-sm text-muted">litres</span>
      </div>
    </div>
  );
}

/* ── Default form values ─────────────────────────────────────────── */

const emptyForm = {
  name:               '',
  mobile:             '',
  address:            '',
  milk_type:          'buffalo',
  price_per_litre:    '',
  start_date:         todayISO(),
  morning_enabled:    false,
  morning_default_qty:'',
  evening_enabled:    false,
  evening_default_qty:'',
  is_active:          true,
  notes:              '',
  customer_code:      '',
};

/* ── Main component ──────────────────────────────────────────────── */

export default function AddCustomer() {
  const { id }  = useParams();
  const isEdit  = id && id !== 'new';
  const navigate = useNavigate();
  const toast   = useToast();

  usePageHeader(
    isEdit ? 'Edit Customer' : 'Add Customer',
    isEdit ? 'Update delivery details and pricing'
           : 'Add a new customer to your delivery list',
  );

  const [form,    setForm]    = useState(emptyForm);
  const [loading, setLoading] = useState(!!isEdit);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  /* Load existing customer when editing */
  useEffect(() => {
    if (!isEdit) return;
    getCustomer(id)
      .then((c) =>
        setForm({
          ...c,
          price_per_litre:     String(c.price_per_litre),
          morning_default_qty: String(c.morning_default_qty),
          evening_default_qty: String(c.evening_default_qty),
          notes:               c.notes  || '',
          address:             c.address || '',
          mobile:              c.mobile  || '',
          customer_code:       c.customer_code || '',
        })
      )
      .catch(() => setError('Could not load customer.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const setField = (field, value) =>
    setForm((f) => ({ ...f, [field]: value }));

  /* ── Save ──────────────────────────────────────────────────────── */

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!form.morning_enabled && !form.evening_enabled) {
      setError('Please enable at least one delivery shift.');
      return;
    }

    const payload = {
      ...form,
      price_per_litre:     Number(form.price_per_litre)     || 0,
      morning_default_qty: form.morning_enabled
        ? Number(form.morning_default_qty) || 0 : 0,
      evening_default_qty: form.evening_enabled
        ? Number(form.evening_default_qty) || 0 : 0,
      // these fields are not shown in the simplified form but the API
      // accepts them — keep them at 0 for new customers
      previous_balance: 0,
      advance_amount:   0,
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
      const msg =
        err.response?.data?.detail || 'Unable to save customer. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ── Archive (soft-delete) ─────────────────────────────────────── */

  const handleArchive = async () => {
    if (!confirm(
      `Archive ${form.name}? They will be marked inactive.\n` +
      `All their delivery and billing history is preserved.`
    )) return;
    try {
      await deleteCustomer(id);
      toast.success('Customer archived');
      navigate('/customers');
    } catch {
      toast.error('Unable to archive customer. Please try again.');
    }
  };

  /* ── Repair zero-rate deliveries ───────────────────────────────── */

  const [repairing,    setRepairing]    = useState(false);
  const [repairResult, setRepairResult] = useState(null);

  const handleRepairRates = async () => {
    const rate = Number(form.price_per_litre);
    if (!rate || rate <= 0) {
      toast.error('Save the correct price per litre first, then use this button.');
      return;
    }
    if (!confirm(
      `Update all ₹0-rate delivery records for ${form.name} to ₹${rate}/L?\n\n` +
      `Only zero-rate deliveries are affected — quantities and statuses stay the same.\n\nContinue?`
    )) return;

    setRepairing(true);
    setRepairResult(null);
    try {
      const result = await repairDeliveryRates(id);
      setRepairResult(result);
      toast.success(
        result.deliveries_fixed > 0
          ? `Fixed ${result.deliveries_fixed} delivery record(s). Regenerate the bill to see correct charges.`
          : 'No zero-rate deliveries found — nothing needed fixing.'
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Unable to repair rates. Please try again.');
    } finally {
      setRepairing(false);
    }
  };

  /* ── Permanent delete ──────────────────────────────────────────── */

  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteInfo, setDeleteInfo] = useState(null);

  const handlePermanentDeleteStart = async () => {
    setDeleteStep(1);
    setDeleteInfo(null);
    try {
      const summary = await getCustomerRecordSummary(id);
      setDeleteInfo(summary);
      setDeleteStep(summary.can_permanent_delete ? 2 : 3);
    } catch {
      toast.error('Could not check customer records. Please try again.');
      setDeleteStep(0);
    }
  };

  const handlePermanentDeleteConfirm = async () => {
    try {
      const result = await permanentDeleteCustomer(id);
      toast.success(result.detail || 'Customer permanently deleted.');
      navigate('/customers');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Unable to delete customer.');
      setDeleteStep(0);
    }
  };

  if (loading) return <div className="text-muted">Loading...</div>;

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>

        {/* ── Basic details ────────────────────────────────────── */}
        <div className="card">
          <div className="section-title">Basic Details</div>

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
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
            />
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
          </div>

          <div className="form-group">
            <label>Address</label>
            <textarea
              className="form-control"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Milk Type</label>
              <select
                className="form-control"
                value={form.milk_type}
                onChange={(e) => setField('milk_type', e.target.value)}
              >
                <option value="buffalo">🐃 Buffalo</option>
                <option value="cow">🐄 Cow</option>
              </select>
            </div>
            <div className="form-group">
              <label>Price per Litre (₹)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="form-control"
                value={form.price_per_litre}
                onChange={(e) => setField('price_per_litre', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              className="form-control"
              value={form.start_date}
              onChange={(e) => setField('start_date', e.target.value)}
            />
          </div>
        </div>

        {/* ── Delivery schedule ────────────────────────────────── */}
        <div className="card">
          <div className="section-title">Delivery Schedule</div>

          <div className="checkbox-row">
            <input
              type="checkbox"
              id="morning_enabled"
              checked={form.morning_enabled}
              onChange={(e) => setField('morning_enabled', e.target.checked)}
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
              id="evening_enabled"
              checked={form.evening_enabled}
              onChange={(e) => setField('evening_enabled', e.target.checked)}
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

        {/* ── Status + notes ───────────────────────────────────── */}
        <div className="card">
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setField('is_active', e.target.checked)}
            />
            <label htmlFor="is_active" style={{ margin: 0 }}>Active customer</label>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea
              className="form-control"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </div>
        </div>

        {/* ── Primary save button ──────────────────────────────── */}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={saving}
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
        </button>

        {/* ── Edit-only danger zone ────────────────────────────── */}
        {isEdit && (
          <>
            {/* Repair zero-rate deliveries */}
            {Number(form.price_per_litre) > 0 && (
              <div
                className="card mt-12"
                style={{
                  borderColor: 'var(--color-warning)',
                  background:  'var(--color-warning-bg)',
                }}
              >
                <div
                  className="section-title"
                  style={{ color: 'var(--color-warning)', marginBottom: 6 }}
                >
                  Fix Bill Calculation
                </div>
                <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
                  If deliveries were recorded when the rate was ₹0, the bill will show
                  ₹0 charges. Click below to update those records to{' '}
                  <strong>₹{form.price_per_litre}/L</strong>.
                  Quantities and statuses are unchanged.
                </div>

                {repairResult && (
                  <div
                    className="text-sm"
                    style={{
                      marginBottom: 10,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background:   repairResult.deliveries_fixed > 0
                        ? 'var(--color-success-bg)' : 'var(--color-surface)',
                      color:        repairResult.deliveries_fixed > 0
                        ? 'var(--color-success)' : 'var(--color-text-muted)',
                      border: '1px solid',
                      borderColor:  repairResult.deliveries_fixed > 0
                        ? 'var(--color-success)' : 'var(--color-border)',
                    }}
                  >
                    {repairResult.deliveries_fixed > 0
                      ? `✓ Fixed ${repairResult.deliveries_fixed} delivery record(s) → ₹${repairResult.rate_applied}/L. Regenerate the bill to see the correct amount.`
                      : '✓ No zero-rate deliveries found — nothing needed fixing.'}
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleRepairRates}
                  disabled={repairing}
                  style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
                >
                  {repairing
                    ? 'Fixing…'
                    : `Fix zero-rate deliveries → ₹${form.price_per_litre}/L`}
                </button>
              </div>
            )}

            {/* Archive */}
            <button
              type="button"
              className="btn btn-danger btn-block mt-12"
              onClick={handleArchive}
            >
              Archive Customer
            </button>

            {/* Permanent delete — step 0: ghost link */}
            {deleteStep === 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-block mt-12"
                style={{ color: 'var(--color-danger)', fontSize: '0.82rem' }}
                onClick={handlePermanentDeleteStart}
              >
                Delete Permanently…
              </button>
            )}

            {/* Step 1: checking */}
            {deleteStep === 1 && (
              <div className="text-sm text-muted mt-12" style={{ textAlign: 'center' }}>
                Checking records…
              </div>
            )}

            {/* Step 2: safe to delete */}
            {deleteStep === 2 && deleteInfo && (
              <div
                className="card mt-12"
                style={{
                  border:     '1.5px solid var(--color-danger)',
                  background: 'var(--color-danger-bg)',
                }}
              >
                <div
                  className="section-title"
                  style={{ color: 'var(--color-danger)', marginBottom: 8 }}
                >
                  Permanently Delete Customer
                </div>
                <div className="text-sm" style={{ marginBottom: 12 }}>
                  <strong>{deleteInfo.customer_name}</strong> has no deliveries,
                  payments or bills. This action <strong>cannot be undone</strong>.
                </div>
                <div className="text-sm text-muted" style={{ marginBottom: 12 }}>
                  Are you sure you want to permanently delete this customer?
                </div>
                <div className="flex-gap">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handlePermanentDeleteConfirm}
                  >
                    Yes, Delete Permanently
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => { setDeleteStep(0); setDeleteInfo(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: blocked — records exist */}
            {deleteStep === 3 && deleteInfo && (
              <div
                className="card mt-12"
                style={{ border: '1.5px solid var(--color-border-strong)' }}
              >
                <div className="section-title" style={{ marginBottom: 8 }}>
                  Cannot Delete Permanently
                </div>
                <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
                  <strong>{deleteInfo.customer_name}</strong> has existing records:
                </div>
                <ul
                  className="text-sm"
                  style={{ margin: '0 0 12px 18px', color: 'var(--color-text-muted)' }}
                >
                  {deleteInfo.delivery_count > 0 && (
                    <li>{deleteInfo.delivery_count} delivery record(s)</li>
                  )}
                  {deleteInfo.payment_count > 0 && (
                    <li>{deleteInfo.payment_count} payment(s)</li>
                  )}
                  {deleteInfo.bill_count > 0 && (
                    <li>{deleteInfo.bill_count} monthly bill(s)</li>
                  )}
                </ul>
                <div className="text-sm" style={{ marginBottom: 12 }}>
                  Use <strong>Archive Customer</strong> to deactivate them while keeping all
                  history.
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setDeleteStep(0); setDeleteInfo(null); }}
                >
                  Close
                </button>
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
}
