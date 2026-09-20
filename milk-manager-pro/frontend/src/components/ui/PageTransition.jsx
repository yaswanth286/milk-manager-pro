/**
 * PageTransition.jsx
 * -------------------
 * Wraps a page's content so that switching routes fades + slightly slides
 * the old page out and the new one in, instead of an instant, jarring
 * swap. Used once, inside Layout.jsx, so every page gets this for free.
 */

import { motion } from 'framer-motion';

const variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export default function PageTransition({ children, routeKey }) {
  return (
    <motion.div
      key={routeKey}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
