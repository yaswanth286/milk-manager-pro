// Central place for constant values used across the app.
// Change API_BASE_URL here (or via .env, see below) when you deploy the
// backend somewhere other than localhost.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const DELIVERY_STATUS = {
  DELIVERED: 'delivered',
  NOT_TAKEN: 'not_taken',
  NOT_DELIVERED: 'not_delivered',
  HOLIDAY: 'holiday',
  PENDING: 'pending', // frontend-only: means "not marked yet today"
};

export const STATUS_LABELS = {
  delivered: 'Delivered',
  not_taken: 'Not Taken',
  not_delivered: 'Not Delivered',
  holiday: 'Holiday',
  pending: 'Pending',
};

export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'other'];

export const MILK_TYPES = ['buffalo', 'cow'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
