/**
 * CountUp.jsx
 * ------------
 * Animates a number counting up from 0 to its real value when it first
 * appears - the subtle "numbers loading in" effect used on the Dashboard
 * KPI cards. Pure CSS/requestAnimationFrame, no extra dependency.
 */

import { useEffect, useRef, useState } from 'react';

export default function CountUp({ value, duration = 700, decimals = 0, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef();

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = Number(value) || 0;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic - starts fast, settles gently, feels premium
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {display.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
