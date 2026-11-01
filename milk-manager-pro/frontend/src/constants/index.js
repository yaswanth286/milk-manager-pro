// Central place for constant values used across the app.
// Change API_BASE_URL here (or via .env, see below) when you deploy the
// backend somewhere other than localhost.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const DELIVERY_STATUS = {
  DELIVERED:     'delivered',
  NOT_DELIVERED: 'not_delivered',
  // Legacy values kept for backward-compatible display of old records
  NOT_TAKEN:     'not_taken',
  HOLIDAY:       'holiday',
  PENDING:       'pending', // frontend-only: means "not saved yet today"
};

// Human-readable labels. Old statuses (not_taken, holiday) are mapped to
// "Not Delivered" so the UI stays consistent without altering DB records.
export const STATUS_LABELS = {
  delivered:     'Delivered',
  not_delivered: 'Not Delivered',
  not_taken:     'Not Delivered', // legacy → display as Not Delivered
  holiday:       'Not Delivered', // legacy → display as Not Delivered
  pending:       'Pending',
};

export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'other'];

export const MILK_TYPES = ['buffalo', 'cow'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
