import api from './api';

export const listCustomers = (search = '', activeOnly = false) =>
  api
    .get('/customers', { params: { search: search || undefined, active_only: activeOnly } })
    .then((res) => res.data);

export const getCustomer = (id) => api.get(`/customers/${id}`).then((res) => res.data);

export const createCustomer = (payload) => api.post('/customers', payload).then((res) => res.data);

export const updateCustomer = (id, payload) => api.put(`/customers/${id}`, payload).then((res) => res.data);

export const deleteCustomer = (id) => api.delete(`/customers/${id}`);

export const getCustomerConsumption = (id, year, month) =>
  api.get(`/customers/${id}/consumption`, { params: { year, month } }).then((res) => res.data);
