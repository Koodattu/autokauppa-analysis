import Link from "next/link";
import { SiteHeader } from "./site-header";

export default function NotFound() {
  return (
    <main className="shell public-shell">
      <SiteHeader />
      <section className="panel page-error">
        <h1>This page isn’t available</h1>
        <p>The address may be outdated, or the requested content may no longer be available.</p>
        <Link className="button-link" href="/">
          Go to analysis
        </Link>
      </section>
    </main>
  );
}
