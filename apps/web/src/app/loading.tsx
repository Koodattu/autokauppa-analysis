export default function Loading() {
  return (
    <main className="shell" aria-busy="true">
      <div className="site-header skeleton-header" />
      <section className="page-heading">
        <div className="skeleton-block skeleton-title" />
      </section>
      <div className="filter-surface skeleton-block skeleton-filter" />
      <section className="metrics analytics-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="metric skeleton-block" key={index} />
        ))}
      </section>
    </main>
  );
}
