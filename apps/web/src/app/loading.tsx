import { SiteHeader } from "./site-header";

export default function Loading() {
  return (
    <main className="shell public-shell" aria-busy="true" aria-label="Loading page">
      <SiteHeader />
      <span className="sr-only" role="status">Loading page</span>
      <section className="page-heading loading-heading">
        <div className="heading-copy">
          <div className="skeleton-block skeleton-context" />
          <div className="skeleton-block skeleton-title" />
          <div className="skeleton-block skeleton-copy" />
        </div>
      </section>
      <div className="filter-surface skeleton-block skeleton-filter" />
      <section className="market-snapshot skeleton-snapshot">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="metric skeleton-block" key={index} />
        ))}
      </section>
    </main>
  );
}
