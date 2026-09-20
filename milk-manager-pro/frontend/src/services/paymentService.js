import api from './api';

export const listPayments = (params) => api.get('/payments', { params }).then((res) => res.data);

export const createPayment = (payload) => api.post('/payments', payload).then((res) => res.data);

export const deletePayment = (id) => api.delete(`/payments/${id}`);

export const getCustomerPayments = (customerId) =>
  api.get(`/payments/customer/${customerId}`).then((res) => res.data);
