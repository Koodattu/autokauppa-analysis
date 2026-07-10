"use client";

import { SiteHeader } from "./site-header";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <SiteHeader />
      <section className="panel error-state page-error">
        <h1>Page unavailable</h1>
        <p>The page could not be loaded.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
