/**
 * ShiftDeliveryScreen.jsx  (v3.0)
 *
 * Key changes:
 * - ALL active customers appear in both Morning and Evening sections.
 *   is_scheduled=false means planned_qty=0 (ad-hoc delivery).
 * - Two statuses only: Delivered | Not Delivered.
 * - Separate Extra Quantity input. Actual = Planned + Extra.
 * - Number inputs have no spinner arrows and ignore mouse-wheel scroll.
 * - Quick-select preset chips for common quantities.
 * - Progress bar shows marked / total for the selected date + shift.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Search, Check, X as XIcon, Milk,
} from 'lucide-react';
import {
  getMorningDeliveries,
  getEveningDeliveries,
  markDelivery,
} from '../../services/deliveryService';
import { formatLitres, todayISO, formatDateDisplay } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../ui/EmptyState';
import { SkeletonRows } from '../ui/Skeleton';

/* ── Quick-select presets (litres) ──────────────────────────────────── */
const QTY_PRESETS = [
  { label: '250 ml', value: 0.25  },
  { label: '375 ml', value: 0.375 },
  { label: '500 ml', value: 0.5   },
  { label: '625 ml', value: 0.625 },
  { label: '750 ml', value: 0.75  },
  { label: '1 L',    value: 1.0   },
  { label: '1.25 L', value: 1.25  },
  { label: '1.5 L',  value: 1.5   },
  { label: '1.75 L', value: 1.75  },
  { label: '2 L',    value: 2.0   },
];

/* ── Safe numeric input (no spinners, no wheel scroll) ──────────────── */
function SafeNumberInput({ value, onChange, placeholder = '0', style = {} }) {
  const ref = useRef(null);

  // Prevent mouse-wheel from changing the value while scrolling the page
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e) => e.preventDefault();
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      min="0"
      step="0.001"
      className="qty-safe-input"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={style}
    />
  );
}

/* ── Preset chip row ─────────────────────────────────────────────────── */
function PresetChips({ activeValue, onSelect }) {
  return (
    <div className="preset-chips">
      {QTY_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`preset-chip ${Number(activeValue) === p.value ? 'active' : ''}`}
          onClick={() => onSelect(p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────── */
export default function ShiftDeliveryScreen({ shift }) {
  const toast = useToast();

  const [date,    setDate]    = useState(todayISO());
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  /* expanded state for each customer row */
  const [expanded, setExpanded] = useState({});

  const fetchRows = (targetDate) => {
    setLoading(true);
    setExpanded({});
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

  /* ── Date navigation ─────────────────────────────────────────────── */
  const shiftDate = (delta) => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const dd   = String(dt.getDate()).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
  };

  /* ── Row state helpers ───────────────────────────────────────────── */
  const updateRow = (customerId, patch) =>
    setRows((prev) =>
      prev.map((r) => (r.customer_id === customerId ? { ...r, ...patch } : r))
    );

  const toggleExpand = (customerId) =>
    setExpanded((prev) => ({ ...prev, [customerId]: !prev[customerId] }));

  /* ── Save one row ───────────────────────────────────────────────── */
  const saveRow = async (row) => {
    updateRow(row.customer_id, { saving: true });
    try {
      const result = await markDelivery({
        customer_id:     row.customer_id,
        date,
        shift,
        status:          row.status === 'pending' ? 'delivered' : row.status,
        actual_quantity: Number(row.actual_quantity) || 0,
        notes:           row.notes || null,
      });
      updateRow(row.customer_id, {
        delivery_id:     result.id,
        planned_quantity: result.planned_quantity,
        extra_quantity:  result.extra_quantity,
        actual_quantity: result.actual_quantity,
        status:          result.status,
        is_saved:        true,
        saving:          false,
        justSaved:       true,
      });
      toast.success(
        result.status === 'delivered'
          ? `${row.customer_name} — ${formatLitres(result.actual_quantity)} delivered`
          : `${row.customer_name} — Not Delivered`
      );
      setTimeout(() => updateRow(row.customer_id, { justSaved: false }), 1400);
    } catch {
      updateRow(row.customer_id, { saving: false });
      toast.error('Unable to save. Please try again.');
    }
  };

  /* ── Quick-mark (one tap) ────────────────────────────────────────── */
  const quickMark = (row, status) => {
    const actual =
      status === 'delivered'
        ? (Number(row.actual_quantity) > 0
            ? Number(row.actual_quantity)
            : Number(row.planned_quantity))
        : 0;
    const updated = { ...row, status, actual_quantity: actual };
    updateRow(row.customer_id, updated);
    saveRow(updated);
  };

  /* ── Extra quantity change ───────────────────────────────────────── */
  const setExtra = (row, extraStr) => {
    const extra  = Math.max(0, Number(extraStr) || 0);
    const actual = Number(row.planned_quantity) + extra;
    updateRow(row.customer_id, {
      extra_quantity:  extra,
      actual_quantity: actual,
    });
  };

  /* ── Planned quantity override (for unscheduled / ad-hoc) ──────── */
  const setPlanned = (row, plannedStr) => {
    const planned = Math.max(0, Number(plannedStr) || 0);
    const extra   = Number(row.extra_quantity) || 0;
    updateRow(row.customer_id, {
      planned_quantity: planned,
      actual_quantity:  planned + extra,
    });
  };

  /* ── Filtered rows ───────────────────────────────────────────────── */
  const filteredRows = rows.filter((r) =>
    r.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.customer_code || '').toLowerCase().includes(search.toLowerCase())
  );

  /* ── Progress bar ────────────────────────────────────────────────── */
  const doneCount    = rows.filter((r) => r.status !== 'pending').length;
  const pendingCount = rows.length - doneCount;
  const pct          = rows.length > 0 ? Math.round((doneCount / rows.length) * 100) : 0;

  /* ── Total litres for the current view ──────────────────────────── */
  const totalLitres = rows
    .filter((r) => r.status === 'delivered')
    .reduce((s, r) => s + (Number(r.actual_quantity) || 0), 0);

  return (
    <div>
      {/* Date navigator */}
      <div className="date-nav">
        <button onClick={() => shiftDate(-1)} aria-label="Previous day">
          <ChevronLeft size={16} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{formatDateDisplay(date)}</div>
          <div className="text-sm text-muted">
            {date === todayISO() ? 'Today' : ''}
          </div>
        </div>
        <button onClick={() => shiftDate(1)} aria-label="Next day">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Progress bar + totals */}
      {rows.length > 0 && (
        <div className="delivery-progress-wrap">
          <div className="delivery-progress-bar">
            <div className="delivery-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="delivery-progress-label">
            {doneCount}/{rows.length} marked · {pendingCount} pending · {formatLitres(totalLitres)} delivered
          </div>
        </div>
      )}

      {/* Search */}
      <div className="search-bar">
        <Search size={16} color="var(--color-text-faint)" />
        <input
          placeholder="Search by name or customer ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <SkeletonRows count={4} />}
      {error   && <div className="form-error">{error}</div>}

      {!loading && filteredRows.length === 0 && (
        <EmptyState
          icon={Milk}
          title="No active customers"
          description="Add customers first, then record their daily deliveries here."
        />
      )}

      {filteredRows.map((row, i) => (
        <motion.div
          key={row.customer_id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, delay: Math.min(i * 0.015, 0.2) }}
        >
          <DeliveryRow
            row={row}
            isExpanded={!!expanded[row.customer_id]}
            onToggleExpand={() => toggleExpand(row.customer_id)}
            onQuickMark={(status) => quickMark(row, status)}
            onSetExtra={(v) => setExtra(row, v)}
            onSetPlanned={(v) => setPlanned(row, v)}
            onSave={() => saveRow(row)}
          />
        </motion.div>
      ))}
    </div>
  );
}

/* ── Individual delivery row card ───────────────────────────────────── */
function DeliveryRow({
  row,
  isExpanded,
  onToggleExpand,
  onQuickMark,
  onSetExtra,
  onSetPlanned,
  onSave,
}) {
  const isDelivered   = row.status === 'delivered';
  const isNotDelivered = row.status === 'not_delivered'
    || row.status === 'not_taken'
    || row.status === 'holiday';
  const isPending      = row.status === 'pending';

  /* Badge color */
  const badgeCls = isDelivered
    ? 'badge-delivered'
    : isNotDelivered
      ? 'badge-not_delivered'
      : 'badge-pending';
  const badgeLabel = isDelivered
    ? 'Delivered'
    : isNotDelivered
      ? 'Not Delivered'
      : 'Pending';

  /* Border colour for the left accent strip */
  const rowCls = isDelivered
    ? 'is-delivered'
    : isNotDelivered
      ? 'is-not_delivered'
      : 'is-pending';

  const planned = Number(row.planned_quantity) || 0;
  const extra   = Number(row.extra_quantity)   || 0;
  const actual  = Number(row.actual_quantity)  || 0;

  return (
    <div className={`delivery-row ${rowCls}`}>
      {/* ── Header row (always visible) ─────────────────────────────── */}
      <div className="delivery-row-top">
        <div style={{ minWidth: 0 }}>
          <div className="delivery-row-name">{row.customer_name}</div>
          <div className="delivery-row-meta">
            {row.customer_code && (
              <span className="customer-code-tag" style={{ marginRight: 6 }}>
                {row.customer_code}
              </span>
            )}
            {row.is_scheduled
              ? `Regular: ${formatLitres(planned)}`
              : <span style={{ color: 'var(--color-accent)', fontStyle: 'italic' }}>Ad-hoc shift</span>
            }
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${badgeCls}`}>{badgeLabel}</span>
          {/* Expand / collapse toggle */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 8px', minHeight: 'unset' }}
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Collapse' : 'Edit quantities'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Quick status buttons (always visible) ───────────────────── */}
      <div className="status-btn-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button
          type="button"
          className={`status-btn ${isDelivered ? 'selected delivered' : ''}`}
          onClick={() => onQuickMark('delivered')}
        >
          <Check size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
          Delivered
        </button>
        <button
          type="button"
          className={`status-btn ${isNotDelivered ? 'selected not_delivered' : ''}`}
          onClick={() => onQuickMark('not_delivered')}
        >
          <XIcon size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
          Not Delivered
        </button>
      </div>

      {/* ── Delivered summary line (collapsed) ──────────────────────── */}
      {isDelivered && !isExpanded && (
        <div
          className="text-sm"
          style={{
            marginTop: 8,
            color: 'var(--color-text-muted)',
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>Regular <strong>{formatLitres(planned)}</strong></span>
          {extra > 0 && (
            <span style={{ color: 'var(--color-accent)' }}>
              Extra <strong>+{formatLitres(extra)}</strong>
            </span>
          )}
          <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
            Total {formatLitres(actual)}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: '0 4px', minHeight: 'unset', fontSize: '0.78rem' }}
            onClick={onToggleExpand}
          >
            Edit ▼
          </button>
        </div>
      )}

      {/* ── Expanded quantity editor ─────────────────────────────────── */}
      {isDelivered && isExpanded && (
        <div className="delivery-qty-editor">

          {/* Regular / planned quantity */}
          <div className="qty-editor-row">
            <div className="qty-editor-label">
              {row.is_scheduled ? 'Regular qty' : 'Delivery qty'}
            </div>
            <div className="qty-editor-controls">
              <PresetChips
                activeValue={planned}
                onSelect={(v) => onSetPlanned(v)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <SafeNumberInput
                  value={planned === 0 ? '' : planned}
                  placeholder="0"
                  onChange={(e) => onSetPlanned(e.target.value)}
                  style={{ width: 90 }}
                />
                <span className="text-sm text-muted">L (custom)</span>
              </div>
            </div>
          </div>

          {/* Extra quantity */}
          <div className="qty-editor-row">
            <div className="qty-editor-label" style={{ color: 'var(--color-accent)' }}>
              Extra qty
            </div>
            <div className="qty-editor-controls">
              <PresetChips
                activeValue={extra}
                onSelect={(v) => onSetExtra(v)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <SafeNumberInput
                  value={extra === 0 ? '' : extra}
                  placeholder="0"
                  onChange={(e) => onSetExtra(e.target.value)}
                  style={{ width: 90 }}
                />
                <span className="text-sm text-muted">L extra</span>
              </div>
            </div>
          </div>

          {/* Actual total (read-only derived field) */}
          <div
            className="text-sm"
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary-dark)',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Total to deliver</span>
            <span>{formatLitres(actual)}</span>
          </div>
        </div>
      )}

      {/* ── Save button ──────────────────────────────────────────────── */}
      {(isDelivered || (isExpanded && isNotDelivered)) && (
        <button
          type="button"
          className={`btn btn-block btn-sm mt-8 ${
            row.justSaved ? 'btn-neutral' : 'btn-primary'
          }`}
          onClick={onSave}
          disabled={row.saving}
          style={{ marginTop: 10 }}
        >
          {row.saving && (
            <span className="spinner-sm" />
          )}
          {row.justSaved && !row.saving && <Check size={14} />}
          {row.saving
            ? 'Saving…'
            : row.justSaved
              ? 'Saved'
              : isDelivered
                ? `Save — ${formatLitres(actual)}`
                : 'Save — Not Delivered'
          }
        </button>
      )}

      {/* ── Not-delivered confirm (collapsed) ───────────────────────── */}
      {isNotDelivered && !isExpanded && !row.is_saved && (
        <button
          type="button"
          className={`btn btn-outline btn-block btn-sm ${row.justSaved ? 'btn-neutral' : ''}`}
          onClick={onSave}
          disabled={row.saving}
          style={{ marginTop: 8 }}
        >
          {row.saving && (
            <span
              className="spinner-sm"
              style={{
                borderColor: 'var(--color-primary)',
                borderTopColor: 'transparent',
              }}
            />
          )}
          {row.justSaved && !row.saving && <Check size={14} />}
          {row.saving ? 'Saving…' : row.justSaved ? 'Saved' : 'Confirm Not Delivered'}
        </button>
      )}
    </div>
  );
}
