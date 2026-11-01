import api from './api';

export const getMorningDeliveries = (date) =>
  api.get('/deliveries/morning', { params: { date } }).then((res) => res.data);

export const getEveningDeliveries = (date) =>
  api.get('/deliveries/evening', { params: { date } }).then((res) => res.data);

export const markDelivery = (payload) => api.post('/deliveries/mark', payload).then((res) => res.data);

export const listDeliveries = (params) => api.get('/deliveries', { params }).then((res) => res.data);

export const repairDeliveryRates = (customerId) =>
  api.post('/deliveries/repair-rates', null, { params: { customer_id: customerId } }).then((res) => res.data);
