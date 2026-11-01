import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Droplets, Sun, Moon, ReceiptText } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { getDashboard } from '../../services/dashboardService';
import { formatLitres } from '../../utils/format';
import { SkeletonKpiGrid } from '../../components/ui/Skeleton';

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

export default function Dashboard() {
  usePageHeader('Dashboard', "Today's milk delivery summary");
  const navigate = useNavigate();

  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    getDashboard(isoDaysAgo(0))
      .then(setData)
      .catch(() => setError('Unable to load dashboard. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      {loading && <SkeletonKpiGrid count={4} />}

      {!loading && data && (
        <>
          {/* ── 4 stat cards ──────────────────────────────────── */}
          <div className="kpi-grid mb-12" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <StatCard
              icon={Users}
              label="Active Customers"
              value={data.active_customers}
              color="var(--color-primary)"
              delay={0}
            />
            <StatCard
              icon={Droplets}
              label="Total Litres Today"
              value={formatLitres(data.todays_total_litres)}
              color="var(--color-primary)"
              delay={0.04}
            />
            <StatCard
              icon={Sun}
              label="Morning Litres"
              value={formatLitres(data.morning.total_litres)}
              color="var(--color-accent)"
              delay={0.08}
            />
            <StatCard
              icon={Moon}
              label="Evening Litres"
              value={formatLitres(data.evening.total_litres)}
              color="var(--color-info)"
              delay={0.12}
            />
          </div>

          {/* ── Shift summary row ─────────────────────────────── */}
          <div className="card mb-12">
            <div className="section-title">Today's Delivery Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <ShiftSummary label="Morning" summary={data.morning} />
              <ShiftSummary label="Evening" summary={data.evening} />
            </div>
          </div>

          {/* ── Quick actions ─────────────────────────────────── */}
          <div className="section-title">Quick Actions</div>
          <div className="quick-actions-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {[
              { label: 'Morning Delivery', icon: Sun,         to: '/delivery/morning' },
              { label: 'Evening Delivery', icon: Moon,        to: '/delivery/evening' },
              { label: 'Monthly Bills',    icon: ReceiptText, to: '/bills'            },
            ].map((a, i) => (
              <motion.button
                key={a.to}
                className="quick-action-btn"
                onClick={() => navigate(a.to)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: i * 0.05 }}
              >
                <span className="quick-action-icon"><a.icon size={18} /></span>
                {a.label}
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, delay }) {
  return (
    <motion.div
      className="kpi-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="kpi-icon" style={{ color }}>
        <Icon size={19} />
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </motion.div>
  );
}

function ShiftSummary({ label, summary }) {
  return (
    <div>
      <div className="text-sm" style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SummaryRow color="var(--color-success)"      label="Delivered"    value={summary.delivered} />
        <SummaryRow color="var(--color-warning)"      label="Not Taken"    value={summary.not_taken} />
        <SummaryRow color="var(--color-text-muted)"   label="Pending"      value={summary.pending} />
      </div>
    </div>
  );
}

function SummaryRow({ color, label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
