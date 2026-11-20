import Link from "next/link";

const destinations = [
  { page: "overview", href: "/", label: "Overview" },
  { page: "analyze", href: "/analyze", label: "Analyze" },
  { page: "compare", href: "/compare", label: "Saved & compare" },
  { page: "listings", href: "/listings", label: "Listings" },
  { page: "methodology", href: "/methodology", label: "Methodology" },
] as const;

export function SiteHeader({ active }: { active?: "overview" | "analyze" | "listings" | "compare" | "methodology" | "admin" }) {
  function navLink(destination: typeof destinations[number]) {
    return <Link key={destination.page} href={destination.href} data-page={destination.page}
      className={active === destination.page ? "active" : undefined}
      aria-current={active === destination.page ? "page" : undefined}>{destination.label}</Link>;
  }
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
        {destinations.map(navLink)}
        <button type="button" className="nav-more" popoverTarget="more-destinations">More</button>
        <div id="more-destinations" className="nav-popover" popover="auto">
          {destinations.filter(({ page }) => page !== "analyze" && page !== "listings").map(navLink)}
        </div>
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
