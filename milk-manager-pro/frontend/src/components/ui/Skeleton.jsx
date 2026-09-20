/**
 * Skeleton.jsx
 * -------------
 * Shimmering placeholder blocks shown WHILE data is loading, instead of a
 * blank screen or a plain "Loading..." string. `Skeleton` is the raw
 * building block (a sized, animated gray box); the others below are
 * common shapes assembled from it, ready to drop into any page.
 */

export function Skeleton({ width = '100%', height = 16, radius = 8, style = {} }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonText({ lines = 1, width = '100%' }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={13}
          width={i === lines - 1 && lines > 1 ? '65%' : width}
          style={{ marginBottom: i === lines - 1 ? 0 : 8 }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 90 }) {
  return (
    <div className="card">
      <Skeleton width={90} height={11} style={{ marginBottom: 10 }} />
      <Skeleton width="55%" height={22} />
    </div>
  );
}

export function SkeletonKpiGrid({ count = 6 }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi-card" key={i}>
          <Skeleton width={38} height={38} radius={10} style={{ marginBottom: 14 }} />
          <Skeleton width={70} height={11} style={{ marginBottom: 8 }} />
          <Skeleton width={60} height={22} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 4 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div className="customer-card" key={i} style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <Skeleton width="45%" height={14} style={{ marginBottom: 8 }} />
            <Skeleton width="30%" height={11} />
          </div>
          <Skeleton width={60} height={18} />
        </div>
      ))}
    </div>
  );
}
