import { Link } from 'react-router-dom';
import { BarChart3, Receipt, Moon, Settings as SettingsIcon, ChevronRight } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';

const ITEMS = [
  { to: '/reports', icon: BarChart3, label: 'Reports', desc: 'Outstanding, revenue, collections' },
  { to: '/bills', icon: Receipt, label: 'Bills', desc: 'Generate and print monthly bills' },
  { to: '/delivery/evening', icon: Moon, label: 'Evening Delivery', desc: 'Mark evening deliveries' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings', desc: 'Account, theme, and app info' },
];

export default function More() {
  usePageHeader('More', 'Everything else, in one place');
  return (
    <div>
      {ITEMS.map((item) => (
        <Link key={item.to} to={item.to} className="customer-card">
          <div className="flex-gap">
            <div className="activity-dot"><item.icon size={16} /></div>
            <div>
              <div className="name">{item.label}</div>
              <div className="meta">{item.desc}</div>
            </div>
          </div>
          <ChevronRight size={16} color="var(--color-text-faint)" />
        </Link>
      ))}
    </div>
  );
}
