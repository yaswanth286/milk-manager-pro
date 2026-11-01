import { Link } from 'react-router-dom';
import { Receipt, Moon, Settings as SettingsIcon, ChevronRight } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';

const ITEMS = [
  { to: '/bills',            icon: Receipt,      label: 'Monthly Bills',    desc: 'Generate and print monthly bills' },
  { to: '/delivery/evening', icon: Moon,         label: 'Evening Delivery', desc: 'Mark evening deliveries' },
  { to: '/settings',         icon: SettingsIcon, label: 'Settings',         desc: 'Account and appearance' },
];

export default function More() {
  usePageHeader('More', 'Quick links');
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
