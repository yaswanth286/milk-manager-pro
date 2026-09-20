import api from './api';

export const getDashboard = (date) => api.get('/dashboard', { params: { date } }).then((res) => res.data);
