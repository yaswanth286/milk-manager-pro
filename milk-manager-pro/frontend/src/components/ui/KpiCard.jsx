/**
 * KpiCard.jsx
 * ------------
 * One "headline metric" card for the Dashboard (Today's Collection,
 * Morning Litres, Active Customers, etc). Handles the icon badge, the
 * animated count-up number, and an optional trend line ("+8.4% from
 * yesterday"), all styled consistently.
 */

import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import CountUp from './CountUp';

export default function KpiCard({ icon: Icon, label, value, decimals = 0, prefix = '', suffix = '', trend, delay = 0 }) {
  const trendDirection = trend == null ? null : trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat';
  const TrendIcon = trendDirection === 'up' ? ArrowUpRight : trendDirection === 'down' ? ArrowDownRight : Minus;

  return (
    <motion.div
      className="kpi-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="kpi-icon"><Icon size={19} /></div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
      {trend != null && (
        <div className={`kpi-trend ${trendDirection}`}>
          <TrendIcon size={13} />
          {Math.abs(trend).toFixed(1)}% vs yesterday
        </div>
      )}
    </motion.div>
  );
}
