import Link from "next/link";

export function SiteHeader({ active }: { active?: "analyze" | "listings" | "admin" }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Nettiauto Analytics home">
        <span className="brand-mark" aria-hidden="true">
          NA
        </span>
        <span>Nettiauto Analytics</span>
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link
          className={active === "analyze" ? "active" : undefined}
          href="/"
          aria-current={active === "analyze" ? "page" : undefined}
        >
          Analyze
        </Link>
        <Link
          className={active === "listings" ? "active" : undefined}
          href="/listings"
          aria-current={active === "listings" ? "page" : undefined}
        >
          Listings
        </Link>
      </nav>
      <Link
        className={`admin-link ${active === "admin" ? "active" : ""}`}
        href="/admin/crawler"
        aria-current={active === "admin" ? "page" : undefined}
      >
        Admin
      </Link>
    </header>
  );
}
