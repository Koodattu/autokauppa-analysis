import Link from "next/link";

export function SiteHeader({ active }: { active?: "overview" | "analyze" | "listings" | "compare" | "methodology" | "admin" }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Nettiauto Analytics home">
        <span className="brand-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          >
            <circle cx="10" cy="10" r="5.25" />
            <path d="m14 14 4.5 4.5" />
          </svg>
        </span>
        <span className="brand-name">Nettiauto Analytics</span>
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link className={active === "overview" ? "active" : undefined} href="/" aria-current={active === "overview" ? "page" : undefined}>Overview</Link>
        <Link
          className={active === "analyze" ? "active" : undefined}
          href="/analyze"
          aria-current={active === "analyze" ? "page" : undefined}
        >
          Analyze
        </Link>
        <Link className={active === "compare" ? "active" : undefined} href="/compare" aria-current={active === "compare" ? "page" : undefined}>Saved & compare</Link>
        <Link
          className={active === "listings" ? "active" : undefined}
          href="/listings"
          aria-current={active === "listings" ? "page" : undefined}
        >
          Listings
        </Link>
        <Link
          className={active === "methodology" ? "active" : undefined}
          href="/methodology"
          aria-current={active === "methodology" ? "page" : undefined}
        >
          Methodology
        </Link>
      </nav>
      {active === "admin" ? (
        <Link className="admin-link active" href="/admin/crawler" aria-current="page">
          Admin
        </Link>
      ) : (
        <span className="header-context">Observed Finnish market data</span>
      )}
    </header>
  );
}
