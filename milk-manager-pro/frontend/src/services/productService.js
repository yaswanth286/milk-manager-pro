import api from './api';

// ── Products ─────────────────────────────────────────────────────────────

export const listProducts = (activeOnly = false) =>
  api.get('/products', { params: { active_only: activeOnly } }).then((r) => r.data);

export const createProduct = (payload) =>
  api.post('/products', payload).then((r) => r.data);

export const updateProduct = (id, payload) =>
  api.put(`/products/${id}`, payload).then((r) => r.data);

export const deleteProduct = (id) =>
  api.delete(`/products/${id}`).then((r) => r.data);

// ── Sales ─────────────────────────────────────────────────────────────────

export const listSales = (params = {}) =>
  api.get('/products/sales', { params }).then((r) => r.data);

export const createSale = (payload) =>
  api.post('/products/sales', payload).then((r) => r.data);

export const updateSale = (id, payload) =>
  api.put(`/products/sales/${id}`, payload).then((r) => r.data);

export const deleteSale = (id) =>
  api.delete(`/products/sales/${id}`).then((r) => r.data);
