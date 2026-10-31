/**
 * ShiftDeliveryScreen.jsx  (v2.0)
 * --------------------------------
 * Changes from v1:
 * - All 4 statuses are now surfaced: Delivered, Not Taken, Not Delivered, Holiday.
 * - A delivery-progress bar shows % complete for the current date.
 * - Customer meta-line handles null mobile gracefully.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Search, Check, X as XIcon,
  Minus, Plus, Milk, AlertCircle, CalendarOff,
} from 'lucide-react';
import { getMorningDeliveries, getEveningDeliveries, markDelivery } from '../../services/deliveryService';
import { formatLitres, todayISO, formatDateDisplay } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';

const STATUS_CONFIG = {
  delivered:     { label: 'Delivered',     color: 'var(--color-success)',  btnCls: 'delivered'     },
  not_taken:     { label: 'Not Taken',     color: 'var(--color-warning)',  btnCls: 'not_taken'     },
  not_delivered: { label: 'Not Delivered', color: 'var(--color-danger)',   btnCls: 'not_delivered' },
  holiday:       { label: 'Holiday',       color: 'var(--color-text-muted)', btnCls: 'holiday'     },
  pending:       { label: 'Pending',       color: 'var(--color-text-faint)', btnCls: ''            },
};

export default function ShiftDeliveryScreen({ shift }) {
  const toast = useToast();
  const [date,    setDate]    = useState(todayISO());
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

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
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const dd   = String(dt.getDate()).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
  };

  const updateRow = (customerId, patch) =>
    setRows((prev) => prev.map((r) => (r.customer_id === customerId ? { ...r, ...patch } : r)));

  const saveRow = async (row) => {
    updateRow(row.customer_id, { saving: true });
    try {
      const result = await markDelivery({
        customer_id:     row.customer_id,
        date,
        shift,
        status:          row.status,
        actual_quantity: Number(row.actual_quantity) || 0,
        notes:           row.notes || null,
      });
      updateRow(row.customer_id, {
        delivery_id:     result.id,
        actual_quantity: result.actual_quantity,
        extra_quantity:  result.extra_quantity,
        status:          result.status,
        is_saved:        true,
        saving:          false,
        justSaved:       true,
      });
      const cfg = STATUS_CONFIG[result.status] || {};
      toast.success(
        result.status === 'delivered'
          ? `${row.customer_name} — ${formatLitres(result.actual_quantity)} delivered`
          : `${row.customer_name} — ${cfg.label || result.status}`
      );
      setTimeout(() => updateRow(row.customer_id, { justSaved: false }), 1200);
    } catch {
      updateRow(row.customer_id, { saving: false });
      toast.error('Unable to save this delivery. Please try again.');
    }
  };

  /** One-tap quick-mark: sets status + appropriate quantity and saves immediately. */
  const quickMark = (row, status) => {
    const actual =
      status === 'delivered'
        ? (Number(row.actual_quantity) || Number(row.planned_quantity))
        : 0;
    const updated = { ...row, status, actual_quantity: actual };
    updateRow(row.customer_id, updated);
    saveRow(updated);
  };

  const adjustQty = (row, delta) => {
    const next = Math.max(0, Math.round((Number(row.actual_quantity || 0) + delta) * 100) / 100);
    updateRow(row.customer_id, { actual_quantity: next });
  };

  const filteredRows = rows.filter((r) =>
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  // Progress counts
  const doneCount    = rows.filter((r) => r.status !== 'pending').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const pct          = rows.length > 0 ? Math.round((doneCount / rows.length) * 100) : 0;

  return (
    <div>
      {/* Date navigator */}
      <div className="date-nav">
        <button onClick={() => shiftDate(-1)} aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{formatDateDisplay(date)}</div>
          <div className="text-sm text-muted">{date === todayISO() ? 'Today' : ''}</div>
        </div>
        <button onClick={() => shiftDate(1)} aria-label="Next day">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Progress bar */}
      {rows.length > 0 && (
        <div className="delivery-progress-wrap">
          <div className="delivery-progress-bar">
            <div className="delivery-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="delivery-progress-label">
            {doneCount}/{rows.length} marked · {pendingCount} pending · {pct}%
          </div>
        </div>
      )}

      {/* Search */}
      <div className="search-bar">
        <Search size={16} color="var(--color-text-faint)" />
        <input
          placeholder="Search customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <SkeletonRows count={4} />}
      {error   && <div className="form-error">{error}</div>}

      {!loading && filteredRows.length === 0 && (
        <EmptyState
          icon={Milk}
          title="No customers scheduled"
          description={`No customers are set up for ${shift} delivery yet. Add a customer and enable this shift.`}
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
            onAdjustQty={(delta)  => adjustQty(row, delta)}
            onQtyChange={(val)    => updateRow(row.customer_id, { actual_quantity: val })}
            onSave={() => saveRow(row)}
          />
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individual customer row card                                          */
/* ------------------------------------------------------------------ */

function DeliveryRowCard({ row, onQuickMark, onAdjustQty, onQtyChange, onSave }) {
  const isExtra   = Number(row.actual_quantity) > Number(row.planned_quantity);
  const extraAmt  = isExtra
    ? (Number(row.actual_quantity) - Number(row.planned_quantity)).toFixed(2)
    : null;

  const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.pending;

  return (
    <div className={`delivery-row is-${row.status}`}>
      {/* Top: name + status badge */}
      <div className="delivery-row-top">
        <div>
          <div className="delivery-row-name">{row.customer_name}</div>
          <div className="delivery-row-meta">
            Normal: {formatLitres(row.planned_quantity)}
            {row.mobile
              ? ` · ${row.mobile}`
              : null}
          </div>
        </div>
        <span className={`badge badge-${row.status}`}>{cfg.label}</span>
      </div>

      {/* Status buttons — 2×2 grid on mobile, 4-in-a-row on wider screens */}
      <div className="status-btn-row">
        <button
          className={`status-btn ${row.status === 'delivered' ? 'selected delivered' : ''}`}
          onClick={() => onQuickMark('delivered')}
        >
          <Check size={13} style={{ marginRight: 3, verticalAlign: -1 }} />
          Delivered
        </button>
        <button
          className={`status-btn ${row.status === 'not_taken' ? 'selected not_taken' : ''}`}
          onClick={() => onQuickMark('not_taken')}
        >
          <XIcon size={13} style={{ marginRight: 3, verticalAlign: -1 }} />
          Not Taken
        </button>
        <button
          className={`status-btn ${row.status === 'not_delivered' ? 'selected not_delivered' : ''}`}
          onClick={() => onQuickMark('not_delivered')}
        >
          <AlertCircle size={13} style={{ marginRight: 3, verticalAlign: -1 }} />
          Not Delivered
        </button>
        <button
          className={`status-btn ${row.status === 'holiday' ? 'selected holiday' : ''}`}
          onClick={() => onQuickMark('holiday')}
        >
          <CalendarOff size={13} style={{ marginRight: 3, verticalAlign: -1 }} />
          Holiday
        </button>
      </div>

      {/* Quantity control — only when Delivered */}
      {row.status === 'delivered' && (
        <>
          <div className="qty-control">
            <button onClick={() => onAdjustQty(-0.5)} aria-label="Decrease quantity">
              <Minus size={15} />
            </button>
            <input
              type="number"
              step="0.1"
              min="0"
              value={row.actual_quantity}
              onChange={(e) => onQtyChange(e.target.value)}
            />
            <button onClick={() => onAdjustQty(0.5)} aria-label="Increase quantity">
              <Plus size={15} />
            </button>
            <span className="text-sm text-muted">litres</span>
          </div>
          {isExtra && (
            <div className="extra-hint">+ {extraAmt} L extra today</div>
          )}

          <button
            className={`btn btn-block btn-sm ${row.justSaved ? 'btn-neutral' : 'btn-primary'}`}
            onClick={onSave}
            disabled={row.saving}
          >
            {row.saving    ? <span className="spinner-sm" /> : null}
            {row.justSaved ? <Check size={14} /> : null}
            {row.saving ? 'Saving…' : row.justSaved ? 'Saved' : 'Save'}
          </button>
        </>
      )}

      {/* Non-delivered statuses: show a compact save confirmation */}
      {row.status !== 'delivered' && row.status !== 'pending' && !row.is_saved && (
        <button
          className={`btn btn-block btn-sm ${row.justSaved ? 'btn-neutral' : 'btn-outline'}`}
          onClick={onSave}
          disabled={row.saving}
          style={{ marginTop: 8 }}
        >
          {row.saving    ? <span className="spinner-sm" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} /> : null}
          {row.justSaved ? <Check size={14} /> : null}
          {row.saving ? 'Saving…' : row.justSaved ? 'Saved' : 'Confirm'}
        </button>
      )}
    </div>
  );
}
