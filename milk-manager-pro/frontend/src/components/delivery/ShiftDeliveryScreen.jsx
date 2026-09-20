/**
 * ShiftDeliveryScreen.jsx
 * ------------------------
 * This is THE most important screen in the app - the one you'll use every
 * single day, twice a day. Both MorningDelivery.jsx and
 * EveningDelivery.jsx pages just render this component with a different
 * `shift` prop, so the logic only has to be written once.
 *
 * Flow per the spec:
 *   Open app -> pick shift -> see today's customers -> tap Delivered/Not
 *   Taken -> adjust quantity if needed -> Save.
 *
 * Each customer row keeps its OWN local state (quantity + status) until
 * you tap Save on that row - nothing is written to the database until
 * then, so browsing around never accidentally creates records.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search, Check, X as XIcon, Minus, Plus, Milk } from 'lucide-react';
import { getMorningDeliveries, getEveningDeliveries, markDelivery } from '../../services/deliveryService';
import { formatLitres, todayISO, formatDateDisplay } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';

export default function ShiftDeliveryScreen({ shift }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchRows = (targetDate) => {
    setLoading(true);
    const fn = shift === 'morning' ? getMorningDeliveries : getEveningDeliveries;
    fn(targetDate)
      .then((data) => setRows(data.rows))
      .catch(() => setError('Unable to load deliveries. Please try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRows(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, shift]);

  const shiftDate = (deltaDays) => {
    // IMPORTANT: don't round-trip through toISOString() here - that
    // converts to UTC, and in timezones ahead of UTC (like India, +5:30)
    // it silently shifts the date backwards by a day. Instead we read
    // the year/month/day back out using LOCAL getters, so the result
    // always matches the date the user actually sees on screen.
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d); // local midnight, safe
    dt.setDate(dt.getDate() + deltaDays);

    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
  };

  const updateRow = (customerId, patch) => {
    setRows((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row) => {
    updateRow(row.customer_id, { saving: true });
    try {
      const result = await markDelivery({
        customer_id: row.customer_id,
        date,
        shift,
        status: row.status,
        actual_quantity: Number(row.actual_quantity) || 0,
        notes: row.notes || null,
      });
      updateRow(row.customer_id, {
        delivery_id: result.id,
        actual_quantity: result.actual_quantity,
        extra_quantity: result.extra_quantity,
        status: result.status,
        is_saved: true,
        saving: false,
        justSaved: true,
      });
      toast.success(
        result.status === 'delivered'
          ? `${row.customer_name} marked delivered (${formatLitres(result.actual_quantity)})`
          : `${row.customer_name} marked not taken`
      );
      setTimeout(() => updateRow(row.customer_id, { justSaved: false }), 1200);
    } catch (err) {
      updateRow(row.customer_id, { saving: false });
      toast.error('Unable to save this delivery. Please try again.');
    }
  };

  const quickMark = (row, status) => {
    // Tapping "Delivered" quickly defaults quantity to the planned amount
    // (if not already set); tapping "Not Taken" zeroes it. Either way we
    // save immediately - this is the "extremely fast" path from the spec.
    const actual = status === 'delivered' ? (row.actual_quantity || row.planned_quantity) : 0;
    const updated = { ...row, status, actual_quantity: actual };
    updateRow(row.customer_id, updated);
    saveRow(updated);
  };

  const adjustQty = (row, delta) => {
    const next = Math.max(0, Math.round((Number(row.actual_quantity || 0) + delta) * 100) / 100);
    updateRow(row.customer_id, { actual_quantity: next });
  };

  const filteredRows = rows.filter((r) => r.customer_name.toLowerCase().includes(search.toLowerCase()));

  const deliveredCount = rows.filter((r) => r.status === 'delivered').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div>
      <div className="date-nav">
        <button onClick={() => shiftDate(-1)} aria-label="Previous day"><ChevronLeft size={16} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{formatDateDisplay(date)}</div>
          <div className="text-sm text-muted">{date === todayISO() ? 'Today' : ''}</div>
        </div>
        <button onClick={() => shiftDate(1)} aria-label="Next day"><ChevronRight size={16} /></button>
      </div>

      <div className="flex-between mb-12">
        <span className="text-sm text-muted">
          {deliveredCount} delivered · {pendingCount} pending of {rows.length}
        </span>
      </div>

      <div className="search-bar">
        <Search size={16} color="var(--color-text-faint)" />
        <input
          placeholder="Search customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <SkeletonRows count={4} />}
      {error && <div className="form-error">{error}</div>}

      {!loading && filteredRows.length === 0 && (
        <EmptyState
          icon={Milk}
          title="No customers scheduled"
          description={`No customers are set up for ${shift} delivery yet. Add a customer and enable this shift to see them here.`}
        />
      )}

      {filteredRows.map((row, i) => (
        <motion.div
          key={row.customer_id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}
        >
          <DeliveryRowCard
            row={row}
            onQuickMark={(status) => quickMark(row, status)}
            onAdjustQty={(delta) => adjustQty(row, delta)}
            onQtyChange={(val) => updateRow(row.customer_id, { actual_quantity: val })}
            onSave={() => saveRow(row)}
          />
        </motion.div>
      ))}
    </div>
  );
}

function DeliveryRowCard({ row, onQuickMark, onAdjustQty, onQtyChange, onSave }) {
  const isExtra = Number(row.actual_quantity) > Number(row.planned_quantity);
  const extraAmount = isExtra ? (row.actual_quantity - row.planned_quantity).toFixed(2) : null;

  return (
    <div className={`delivery-row is-${row.status}`}>
      <div className="delivery-row-top">
        <div>
          <div className="delivery-row-name">{row.customer_name}</div>
          <div className="delivery-row-meta">Normal: {formatLitres(row.planned_quantity)}</div>
        </div>
        <span className={`badge badge-${row.status}`}>
          {row.status === 'delivered' ? 'Delivered' : row.status === 'pending' ? 'Pending' : 'Not Taken'}
        </span>
      </div>

      <div className="status-btn-row">
        <button
          className={`status-btn ${row.status === 'delivered' ? 'selected delivered' : ''}`}
          onClick={() => onQuickMark('delivered')}
        >
          <Check size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Delivered
        </button>
        <button
          className={`status-btn ${row.status === 'not_taken' ? 'selected not_taken' : ''}`}
          onClick={() => onQuickMark('not_taken')}
        >
          <XIcon size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Not Taken
        </button>
      </div>

      {row.status === 'delivered' && (
        <>
          <div className="qty-control">
            <button onClick={() => onAdjustQty(-0.5)} aria-label="Decrease quantity"><Minus size={15} /></button>
            <input
              type="number"
              step="0.1"
              min="0"
              value={row.actual_quantity}
              onChange={(e) => onQtyChange(e.target.value)}
            />
            <button onClick={() => onAdjustQty(0.5)} aria-label="Increase quantity"><Plus size={15} /></button>
            <span className="text-sm text-muted">litres</span>
          </div>
          {isExtra && <div className="extra-hint">+ {extraAmount} L extra today</div>}

          <button
            className={`btn btn-block btn-sm ${row.justSaved ? 'btn-neutral' : 'btn-primary'}`}
            onClick={onSave}
            disabled={row.saving}
          >
            {row.saving ? <span className="spinner-sm" /> : row.justSaved ? <Check size={14} /> : null}
            {row.saving ? 'Saving...' : row.justSaved ? 'Saved' : 'Save'}
          </button>
        </>
      )}
    </div>
  );
}
