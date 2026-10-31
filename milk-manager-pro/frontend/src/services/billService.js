import api from './api';

export const getBill = (customerId, year, month) =>
  api.get(`/bills/${customerId}/${year}/${month}`).then((res) => res.data);

export const generateBill = (customerId, year, month) =>
  api.post('/bills/generate', null, { params: { customer_id: customerId, year, month } }).then((res) => res.data);

export const getAllBills = (year, month, onlyWithActivity = true) =>
  api
    .get(`/bills/batch/${year}/${month}`, { params: { only_with_activity: onlyWithActivity } })
    .then((res) => res.data);

export const generateAllBills = (year, month) =>
  api.post(`/bills/generate-all/${year}/${month}`).then((res) => res.data);

export const reopenBill = (customerId, year, month, reason) =>
  api
    .post(`/bills/${customerId}/${year}/${month}/reopen`, { reason })
    .then((res) => res.data);
