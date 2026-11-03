/**
 * Products.jsx
 * -------------
 * Two-tab page:
 *   • "Products"  — catalogue management (add / edit / activate / deactivate)
 *   • "Sales"     — record a sale + full history with filters, edit, delete
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Pencil, Package, ShoppingCart, Search,
  Check, X as XIcon, Trash2,
} from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useToast } from '../../context/ToastContext';
import {
  listProducts, createProduct, updateProduct,
  listSales, createSale, updateSale, deleteSale,
} from '../../services/productService';
import { listCustomers } from '../../services/customerService';
import { formatCurrency, formatDateShort, todayISO } from '../../utils/format';
import { MONTH_NAMES } from '../../constants';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonRows, SkeletonCard } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';

/* ── Common unit options ─────────────────────────────────────────────── */
const UNITS = ['g', 'kg', 'ml', 'litre', 'piece'];

/* ── Small shared helpers ────────────────────────────────────────────── */
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/* ==================================================================== */
/* MAIN PAGE                                                              */
/* ==================================================================== */

export default function Products() {
  usePageHeader('Other Products', 'Manage products and record customer sales');
  const [tab, setTab] = useState('sales');

  return (
    <div>
      <div className="tab-row no-print">
        <button
          className={`tab-btn ${tab === 'sales' ? 'active' : ''}`}
          onClick={() => setTab('sales')}
        >
          <ShoppingCart size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          Sales
        </button>
        <button
          className={`tab-btn ${tab === 'products' ? 'active' : ''}`}
          onClick={() => setTab('products')}
        >
          <Package size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          Products
        </button>
      </div>

      {tab === 'products' && <ProductsTab />}
      {tab === 'sales'    && <SalesTab />}
    </div>
  );
}

/* ==================================================================== */
/* PRODUCTS TAB                                                           */
/* ==================================================================== */

function ProductsTab() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null); // null = new, else product object

  const refresh = useCallback(() => {
    setLoading(true);
    listProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const visible = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.product_code || '').toLowerCase().includes(search.toLowerCase())
  );

  const openNew  = ()  => { setEditing(null);    setModalOpen(true); };
  const openEdit = (p) => { setEditing(p);        setModalOpen(true); };
  const close    = ()  => { setModalOpen(false);  setEditing(null);   };

  const handleToggleActive = async (p) => {
    try {
      await updateProduct(p.id, { is_active: !p.is_active });
      toast.success(`${p.name} ${p.is_active ? 'deactivated' : 'activated'}`);
      refresh();
    } catch {
      toast.error('Unable to update product status.');
    }
  };

  return (
    <div>
      <div className="search-bar">
        <Search size={16} color="var(--color-text-faint)" />
        <input
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-block mb-12" onClick={openNew}>
        <Plus size={16} /> Add Product
      </button>

      {loading && <SkeletonRows count={3} />}

      {!loading && visible.length === 0 && (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add Paneer, Cream, or any other product you sell."
          action={
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={16} /> Add Product
            </button>
          }
        />
      )}

      {visible.map((p, i) => (
        <motion.div
          key={p.id}
          className="customer-card"
          style={{ cursor: 'default' }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: Math.min(i * 0.03, 0.25) }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.name}
              {!p.is_active && (
                <span className="badge badge-pending" style={{ fontSize: '0.65rem' }}>Inactive</span>
              )}
            </div>
            <div className="meta">
              {p.product_code && (
                <span className="customer-code-tag" style={{ marginRight: 6 }}>
                  {p.product_code}
                </span>
              )}
              Unit: {p.unit}
            </div>
          </div>
          <div className="flex-gap">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => openEdit(p)}
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            <button
              className={`btn btn-sm ${p.is_active ? 'btn-danger' : 'btn-neutral'}`}
              onClick={() => handleToggleActive(p)}
              title={p.is_active ? 'Deactivate' : 'Activate'}
              style={{ minWidth: 90 }}
            >
              {p.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </motion.div>
      ))}

      <Modal
        open={modalOpen}
        onClose={close}
        title={editing ? 'Edit Product' : 'Add Product'}
      >
        <ProductForm
          initial={editing}
          onSaved={() => { close(); refresh(); }}
        />
      </Modal>
    </div>
  );
}

function ProductForm({ initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name:  initial?.name  || '',
    unit:  initial?.unit  || 'kg',
    notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Product name is required.'); return; }

    setSaving(true);
    try {
      if (initial) {
        await updateProduct(initial.id, { name: form.name.trim(), unit: form.unit, notes: form.notes || null });
        toast.success('Product updated');
      } else {
        await createProduct({ name: form.name.trim(), unit: form.unit, notes: form.notes || null });
        toast.success('Product added');
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Unable to save product.';
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
        <label>Product Name *</label>
        <input
          className="form-control"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Paneer"
          required
        />
      </div>

      <div className="form-group">
        <label>Unit of Measurement</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => set('unit', u)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: '1.5px solid',
                borderColor: form.unit === u ? 'var(--color-primary)' : 'var(--color-border)',
                background:  form.unit === u ? 'var(--color-primary)' : 'transparent',
                color:       form.unit === u ? '#fff' : 'inherit',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: form.unit === u ? 600 : 400,
              }}
            >
              {u}
            </button>
          ))}
        </div>
        <input
          className="form-control"
          value={form.unit}
          onChange={(e) => set('unit', e.target.value)}
          placeholder="Custom unit (e.g. packet)"
          style={{ maxWidth: 200 }}
        />
      </div>

      <div className="form-group">
        <label>Notes (optional)</label>
        <textarea
          className="form-control"
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Product'}
      </button>
    </form>
  );
}

/* ==================================================================== */
/* SALES TAB                                                              */
/* ==================================================================== */

function SalesTab() {
  const toast = useToast();

  /* ── shared data ──────────────────────────────────────────────────── */
  const [products,  setProducts]  = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    listProducts(true).then(setProducts);
    listCustomers('', true).then(setCustomers);
  }, []);

  /* ── sale form modal ──────────────────────────────────────────────── */
  const [formOpen, setFormOpen] = useState(false);
  const [editSale, setEditSale] = useState(null); // null = new

  /* ── history filters ──────────────────────────────────────────────── */
  const [dateFrom,    setDateFrom]    = useState(firstOfMonth());
  const [dateTo,      setDateTo]      = useState(todayISO());
  const [filterCust,  setFilterCust]  = useState('');
  const [filterProd,  setFilterProd]  = useState('');
  const [searchText,  setSearchText]  = useState('');

  const [sales,   setSales]   = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSales = useCallback(() => {
    setLoading(true);
    listSales({
      date_from:   dateFrom || undefined,
      date_to:     dateTo   || undefined,
      customer_id: filterCust || undefined,
      product_id:  filterProd || undefined,
    })
      .then(setSales)
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, filterCust, filterProd]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const openNew  = ()  => { setEditSale(null);  setFormOpen(true); };
  const openEdit = (s) => { setEditSale(s);     setFormOpen(true); };
  const closeForm = ()  => { setFormOpen(false); setEditSale(null); };

  const handleDelete = async (sale) => {
    if (!confirm(
      `Delete this sale?\n\n` +
      `${sale.product_name}  ${sale.quantity} ${sale.unit}  ` +
      `for ${sale.customer_name}  on ${formatDateShort(sale.sale_date)}\n\n` +
      `This cannot be undone.`
    )) return;
    try {
      await deleteSale(sale.id);
      toast.success('Sale deleted');
      fetchSales();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Unable to delete sale.');
    }
  };

  /* ── visible (client-side text search) ───────────────────────────── */
  const visible = sales.filter((s) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      (s.customer_name || '').toLowerCase().includes(q) ||
      (s.product_name  || '').toLowerCase().includes(q)
    );
  });

  const totalVisible = visible.reduce((sum, s) => sum + s.total_amount, 0);

  return (
    <div>
      {/* ── Record new sale button ─────────────────────────────────── */}
      <button className="btn btn-primary btn-block mb-12" onClick={openNew}>
        <Plus size={16} /> Record Sale
      </button>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="card mb-12">
        <div className="form-row">
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Customer</label>
            <select className="form-control" value={filterCust}
              onChange={(e) => setFilterCust(e.target.value)}>
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Product</label>
            <select className="form-control" value={filterProd}
              onChange={(e) => setFilterProd(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="search-bar" style={{ marginBottom: 0 }}>
          <Search size={15} color="var(--color-text-faint)" />
          <input
            placeholder="Search customer or product…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* ── Summary line ──────────────────────────────────────────── */}
      {!loading && visible.length > 0 && (
        <div className="text-sm text-muted mb-12" style={{ textAlign: 'right' }}>
          {visible.length} sale{visible.length !== 1 ? 's' : ''} ·{' '}
          Total: <strong style={{ color: 'var(--color-primary)' }}>
            {formatCurrency(totalVisible)}
          </strong>
        </div>
      )}

      {/* ── Sales list ────────────────────────────────────────────── */}
      {loading && <SkeletonRows count={4} />}

      {!loading && visible.length === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="No sales in this range"
          description="Record a sale above, or widen the date filter."
          action={
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={16} /> Record Sale
            </button>
          }
        />
      )}

      {visible.map((s, i) => (
        <motion.div
          key={s.id}
          className="customer-card"
          style={{ cursor: 'default', alignItems: 'flex-start' }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.2) }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="name">
              {s.customer_name}
              {s.product_code && (
                <span className="customer-code-tag" style={{ marginLeft: 8 }}>
                  {s.product_code}
                </span>
              )}
            </div>
            <div className="meta">
              {formatDateShort(s.sale_date)} · {s.product_name} ·{' '}
              {s.quantity} {s.unit} @ ₹{s.price_per_unit}/{s.unit}
            </div>
            {s.remarks && (
              <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                {s.remarks}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div className="balance text-success">{formatCurrency(s.total_amount)}</div>
            <div className="flex-gap">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => openEdit(s)}
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(s)}
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </motion.div>
      ))}

      {/* ── Sale form modal ────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editSale ? 'Edit Sale' : 'Record Sale'}
      >
        <SaleForm
          initial={editSale}
          products={products}
          customers={customers}
          onSaved={() => { closeForm(); fetchSales(); }}
        />
      </Modal>
    </div>
  );
}

/* ==================================================================== */
/* SALE FORM                                                              */
/* ==================================================================== */

function SaleForm({ initial, products, customers, onSaved }) {
  const toast = useToast();
  const isEdit = !!initial;

  /* Build initial product unit from matching product */
  const initialProduct = initial
    ? products.find((p) => p.id === initial.product_id)
    : null;

  const [form, setForm] = useState({
    customer_id:    initial?.customer_id    ?? '',
    product_id:     initial?.product_id     ?? '',
    sale_date:      initial?.sale_date      ?? todayISO(),
    quantity:       initial?.quantity       ?? '',
    unit:           initial?.unit           ?? initialProduct?.unit ?? 'kg',
    price_per_unit: initial?.price_per_unit ?? '',
    remarks:        initial?.remarks        ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* When product changes, update the unit */
  const handleProductChange = (productId) => {
    const p = products.find((pr) => String(pr.id) === String(productId));
    set('product_id', productId);
    if (p) set('unit', p.unit);
  };

  /* Auto-calculate total */
  const qty   = parseFloat(form.quantity)       || 0;
  const price = parseFloat(form.price_per_unit) || 0;
  const total = Math.round(qty * price * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.customer_id) { setError('Please select a customer.'); return; }
    if (!form.product_id)  { setError('Please select a product.');  return; }
    if (qty <= 0)          { setError('Quantity must be greater than 0.'); return; }
    if (price < 0)         { setError('Price cannot be negative.'); return; }

    const payload = {
      customer_id:    Number(form.customer_id),
      product_id:     Number(form.product_id),
      sale_date:      form.sale_date,
      quantity:       qty,
      unit:           form.unit.trim() || 'kg',
      price_per_unit: price,
      total_amount:   total,
      remarks:        form.remarks.trim() || null,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateSale(initial.id, payload);
        toast.success('Sale updated');
      } else {
        await createSale(payload);
        toast.success('Sale recorded');
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Unable to save sale.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}

      {/* Date */}
      <div className="form-group">
        <label>Purchase Date *</label>
        <input
          type="date"
          className="form-control"
          value={form.sale_date}
          onChange={(e) => set('sale_date', e.target.value)}
          required
        />
      </div>

      {/* Customer */}
      <div className="form-group">
        <label>Customer *</label>
        <select
          className="form-control"
          value={form.customer_id}
          onChange={(e) => set('customer_id', e.target.value)}
          required
        >
          <option value="">Select customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.customer_code ? ` (${c.customer_code})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Product */}
      <div className="form-group">
        <label>Product *</label>
        <select
          className="form-control"
          value={form.product_id}
          onChange={(e) => handleProductChange(e.target.value)}
          required
        >
          <option value="">Select product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
          ))}
        </select>
      </div>

      {/* Quantity + Unit */}
      <div className="form-row">
        <div className="form-group">
          <label>Quantity *</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            className="form-control qty-safe-input"
            style={{ width: '100%', textAlign: 'left' }}
            placeholder="e.g. 500"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Unit</label>
          <input
            className="form-control"
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            placeholder="g / kg / ml…"
          />
        </div>
      </div>

      {/* Price per unit */}
      <div className="form-group">
        <label>Selling Price (₹ per {form.unit || 'unit'}) *</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className="form-control qty-safe-input"
          style={{ width: '100%', textAlign: 'left' }}
          placeholder="e.g. 180"
          value={form.price_per_unit}
          onChange={(e) => set('price_per_unit', e.target.value)}
          required
        />
        <div className="form-hint">
          This price applies only to this transaction.
        </div>
      </div>

      {/* Auto-calculated total */}
      <div
        className="card mb-12"
        style={{
          background: 'var(--color-primary-light)',
          border: '1px solid var(--color-primary-soft)',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-sm" style={{ color: 'var(--color-primary-dark)', fontWeight: 600 }}>
            Total Amount
          </span>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary-dark)' }}>
            {formatCurrency(total)}
          </span>
        </div>
        {qty > 0 && price > 0 && (
          <div className="text-sm" style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
            {qty} {form.unit} × ₹{price}/{form.unit} = {formatCurrency(total)}
          </div>
        )}
      </div>

      {/* Remarks */}
      <div className="form-group">
        <label>Remarks (optional)</label>
        <input
          className="form-control"
          value={form.remarks}
          onChange={(e) => set('remarks', e.target.value)}
          placeholder="Optional note"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Record Sale'}
      </button>
    </form>
  );
}
