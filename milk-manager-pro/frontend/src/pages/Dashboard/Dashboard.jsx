import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  Users, Droplets, Wallet, AlertTriangle, Sun, Moon, UserPlus, ReceiptText, CreditCard,
} from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { getDashboard } from '../../services/dashboardService';
import { listDeliveries } from '../../services/deliveryService';
import { listPayments } from '../../services/paymentService';
import { formatCurrency, formatLitres, formatDateDisplay, formatDateShort } from '../../utils/format';
import KpiCard from '../../components/ui/KpiCard';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonKpiGrid, Skeleton } from '../../components/ui/Skeleton';

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

const pctChange = (today, yesterday) => {
  if (!yesterday) return today > 0 ? 100 : 0;
  return ((today - yesterday) / yesterday) * 100;
};

export default function Dashboard() {
  usePageHeader('Dashboard', "Here's what's happening in your business today");
  const navigate = useNavigate();

  const [today, setToday] = useState(null);
  const [yesterday, setYesterday] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const todayStr = isoDaysAgo(0);
    const weekAgoStr = isoDaysAgo(6);

    Promise.all([
      getDashboard(todayStr),
      getDashboard(isoDaysAgo(1)),
      listDeliveries({ date_from: weekAgoStr, date_to: todayStr }),
      listPayments({ date_from: weekAgoStr, date_to: todayStr }),
    ])
      .then(([todayData, yesterdayData, deliveries, payments]) => {
        setToday(todayData);
        setYesterday(yesterdayData);

        // Build a real 7-day trend from actual delivery records (no
        // fabricated data) - one bucket per day, split by shift.
        const buckets = {};
        for (let i = 6; i >= 0; i--) {
          const d = isoDaysAgo(i);
          buckets[d] = { date: d, morning: 0, evening: 0 };
        }
        deliveries.forEach((d) => {
          if (buckets[d.date] && d.status === 'delivered') {
            buckets[d.date][d.shift] += d.actual_quantity;
          }
        });
        setChartData(Object.values(buckets));

        // Recent activity: real payments (have exact timestamps) merged
        // with real recent deliveries (ordered by id - higher id = more
        // recently created, since it's an autoincrement primary key).
        const paymentEvents = payments
          .slice(0, 6)
          .map((p) => ({
            key: `pay-${p.id}`,
            type: 'payment',
            title: `Payment received from ${p.customer_name}`,
            sub: formatCurrency(p.amount),
            time: formatDateDisplay(p.date),
          }));
        const deliveryEvents = [...deliveries]
          .filter((d) => d.status === 'delivered')
          .sort((a, b) => b.id - a.id)
          .slice(0, 6)
          .map((d) => ({
            key: `del-${d.id}`,
            type: 'delivery',
            title: `${d.customer_name} received ${formatLitres(d.actual_quantity)}`,
            sub: `${d.shift === 'morning' ? 'Morning' : 'Evening'} delivery`,
            time: formatDateShort(d.date),
          }));
        setActivity([...paymentEvents, ...deliveryEvents].slice(0, 8));
      })
      .catch(() => setError('Unable to load dashboard data. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      {loading && <SkeletonKpiGrid />}

      {!loading && today && (
        <>
          <div className="kpi-grid mb-12">
            <KpiCard
              icon={Wallet}
              label="Today's Collection"
              value={today.todays_collection}
              prefix="₹"
              decimals={0}
              trend={pctChange(today.todays_collection, yesterday?.todays_collection)}
              delay={0}
            />
            <KpiCard
              icon={Droplets}
              label="Today's Litres"
              value={today.todays_total_litres}
              decimals={1}
              suffix=" L"
              trend={pctChange(today.todays_total_litres, yesterday?.todays_total_litres)}
              delay={0.03}
            />
            <KpiCard
              icon={Sun}
              label="Morning"
              value={today.morning.total_litres}
              decimals={1}
              suffix=" L"
              delay={0.06}
            />
            <KpiCard
              icon={Moon}
              label="Evening"
              value={today.evening.total_litres}
              decimals={1}
              suffix=" L"
              delay={0.09}
            />
            <KpiCard
              icon={Users}
              label="Active Customers"
              value={today.active_customers}
              delay={0.12}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Outstanding"
              value={today.outstanding_balance}
              prefix="₹"
              delay={0.15}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }} className="mb-12">
            <QuickActions navigate={navigate} />
          </div>

          <div className="responsive-two-col mb-12">
            <MilkTrendChart data={chartData} />
            <ShiftBreakdown today={today} navigate={navigate} />
          </div>

          <ActivityFeed activity={activity} />
        </>
      )}
    </div>
  );
}

function QuickActions({ navigate }) {
  const actions = [
    { label: 'Add Customer', icon: UserPlus, to: '/customers/new' },
    { label: 'Morning Delivery', icon: Sun, to: '/delivery/morning' },
    { label: 'Evening Delivery', icon: Moon, to: '/delivery/evening' },
    { label: 'Add Payment', icon: CreditCard, to: '/payments?new' },
    { label: 'Generate Bills', icon: ReceiptText, to: '/bills' },
  ];
  return (
    <div>
      <div className="section-title">Quick Actions</div>
      <div className="quick-actions-grid">
        {actions.map((a, i) => (
          <motion.button
            key={a.to}
            className="quick-action-btn"
            onClick={() => navigate(a.to)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
          >
            <span className="quick-action-icon"><a.icon size={18} /></span>
            {a.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function MilkTrendChart({ data }) {
  if (!data) {
    return (
      <div className="chart-card">
        <Skeleton height={220} radius={12} />
      </div>
    );
  }
  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>Milk Collection (Last 7 Days)</h3>
        <div className="chart-legend">
          <span><span className="dot" style={{ background: 'var(--color-primary)' }} />Morning</span>
          <span><span className="dot" style={{ background: 'var(--color-accent)' }} />Evening</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDateShort(d)}
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)} L`}
            labelFormatter={(d) => formatDateDisplay(d)}
            contentStyle={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-md)',
            }}
          />
          <Bar dataKey="morning" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="evening" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ShiftBreakdown({ today, navigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ShiftCard title="Morning Delivery" icon={Sun} summary={today.morning} onClick={() => navigate('/delivery/morning')} />
      <ShiftCard title="Evening Delivery" icon={Moon} summary={today.evening} onClick={() => navigate('/delivery/evening')} />
    </div>
  );
}

function ShiftCard({ title, icon: Icon, summary, onClick }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="flex-between mb-12">
        <div className="flex-gap section-title" style={{ margin: 0 }}>
          <Icon size={16} /> {title}
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClick}>Open</button>
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <MiniStat label="Delivered" value={summary.delivered} color="var(--color-success)" />
        <MiniStat label="Not Taken" value={summary.not_taken} color="var(--color-warning)" />
        <MiniStat label="Pending" value={summary.pending} color="var(--color-text-muted)" />
        <MiniStat label="Litres" value={formatLitres(summary.total_litres)} color="var(--color-primary)" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.66rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function ActivityFeed({ activity }) {
  return (
    <div className="chart-card">
      <div className="chart-head"><h3>Recent Activity</h3></div>
      {activity == null && <Skeleton height={160} radius={12} />}
      {activity && activity.length === 0 && (
        <EmptyState title="No activity yet" description="Deliveries and payments will show up here as you record them." />
      )}
      {activity && activity.length > 0 && (
        <div className="activity-list">
          {activity.map((item) => (
            <div className="activity-item" key={item.key}>
              <div className="activity-dot">
                {item.type === 'payment' ? <Wallet size={15} /> : <Droplets size={15} />}
              </div>
              <div style={{ flex: 1 }}>
                <div className="activity-title">{item.title}</div>
                <div className="activity-sub">{item.sub}</div>
              </div>
              <div className="activity-time">{item.time}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
