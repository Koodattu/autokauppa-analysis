import Link from "next/link";
import { SiteHeader } from "./site-header";

export default function NotFound() {
  return (
    <main className="shell">
      <SiteHeader />
      <section className="panel page-error">
        <h1>Not found</h1>
        <p>The requested page does not exist.</p>
        <Link className="button-link" href="/">
          Go to analysis
        </Link>
      </section>
    </main>
  );
}
