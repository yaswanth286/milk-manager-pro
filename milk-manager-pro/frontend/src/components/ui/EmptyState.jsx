/**
 * EmptyState.jsx
 * ---------------
 * A consistent "nothing here yet" panel used across Customers, Payments,
 * Deliveries, Reports, and Bills, instead of every page inventing its own
 * empty message. Pass an icon (any lucide-react component), a title, a
 * short description, and optionally an action button.
 */

import { motion } from 'framer-motion';

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="icon">{Icon ? <Icon size={26} /> : '🥛'}</div>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action}
    </motion.div>
  );
}
