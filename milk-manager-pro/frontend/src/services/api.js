/**
 * api.js
 * ------
 * A single, shared Axios instance for the whole app.
 *
 * Two interceptors do the important work:
 *
 * 1. REQUEST interceptor: before every API call leaves the browser, it
 *    reads the JWT token from localStorage and attaches it as
 *    "Authorization: Bearer <token>". This is what "logs in" each request
 *    on the backend - without this, every protected endpoint would
 *    return 401 Unauthorized.
 *
 * 2. RESPONSE interceptor: if the backend ever replies with 401 (token
 *    missing/expired/invalid), we automatically clear the stored session
 *    and send the user back to the Login page. This means the rest of
 *    the app never has to think about "what if the token expired" -
 *    it's handled in exactly one place.
 */

import axios from 'axios';
import { API_BASE_URL } from '../constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mmp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('mmp_token');
      localStorage.removeItem('mmp_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
