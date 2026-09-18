export function LoadingState({ label = "Loading dashboard" }: { label?: string }) {
  return (
    <div className="loading-panel" aria-live="polite" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function MetricSkeletons() {
  return (
    <div className="metric-grid" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="metric-card" key={index}>
          <div className="skeleton skeleton--label" />
          <div className="skeleton skeleton--value" />
          <div className="skeleton skeleton--meta" />
        </div>
      ))}
    </div>
  );
}
