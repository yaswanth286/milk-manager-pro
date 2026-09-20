// Small, dependency-free formatting helpers used across pages.

export const formatCurrency = (value) => {
  const num = Number(value || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatLitres = (value) => {
  const num = Number(value || 0);
  // Show whole numbers cleanly (1 L) and decimals cleanly (1.5 L)
  return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)} L`;
};

// Returns YYYY-MM-DD for <input type="date"> and API calls, in LOCAL time
// (avoids the classic bug where toISOString() shifts the date by a day).
export const todayISO = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
};

export const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateShort = (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
