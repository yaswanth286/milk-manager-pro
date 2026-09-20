import api from './api';

export const getOutstandingBalances = () => api.get('/reports/outstanding-balances').then((res) => res.data);

export const getLitresAndRevenue = (params) =>
  api.get('/reports/litres-and-revenue', { params }).then((res) => res.data);

export const getPaymentsSummary = (params) =>
  api.get('/reports/payments-summary', { params }).then((res) => res.data);

export const getDailyReport = (date) => api.get('/reports/daily', { params: { date } }).then((res) => res.data);
