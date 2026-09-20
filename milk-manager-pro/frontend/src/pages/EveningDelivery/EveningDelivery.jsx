import { NavLink } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import ShiftDeliveryScreen from '../../components/delivery/ShiftDeliveryScreen';

export default function EveningDelivery() {
  usePageHeader('Evening Delivery', 'Mark today\u2019s evening deliveries');
  return (
    <div>
      <div className="tab-row">
        <NavLink to="/delivery/morning" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
          <Sun size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Morning
        </NavLink>
        <NavLink to="/delivery/evening" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
          <Moon size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Evening
        </NavLink>
      </div>
      <ShiftDeliveryScreen shift="evening" />
    </div>
  );
}
