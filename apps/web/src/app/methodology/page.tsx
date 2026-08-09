import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How Nettiauto Analytics collects and interprets observed vehicle listing data.",
};

export default function MethodologyPage() {
  return (
    <main className="shell public-shell">
      <SiteHeader active="methodology" />
      <section className="page-heading compact-heading">
        <div className="heading-copy">
          <span className="heading-context">Interpretation guide</span>
          <h1>Methodology</h1>
          <p className="heading-meta">What the figures measure, how observations become trends, and where the data has limits.</p>
        </div>
      </section>

      <article className="panel methodology-content">
        <MethodSection title="Observed listings, not transactions">
          <p>Prices and availability are captured from Nettiauto listings. An observed-sold listing is a listing seen in the sold results; it does not confirm that a transaction completed or reveal the final sale price.</p>
        </MethodSection>
        <MethodSection title="Current snapshots">
          <p>Snapshot summaries and filters use the latest stored version of each listing. Current and observed-sold counts reflect the latest availability we observed, subject to the freshness shown on the page.</p>
        </MethodSection>
        <MethodSection title="Trends over time">
          <p>Trend buckets use only completed, internally consistent crawl runs. For each period, the latest complete observation set for each requested crawl kind is used. If current or sold listings were not observed in a period, the chart shows that kind as not observed rather than as zero.</p>
        </MethodSection>
        <MethodSection title="Prices and samples">
          <p>Medians reduce the effect of extreme prices. Middle-50% ranges run from the 25th to the 75th percentile. Every chart reports or exposes its sample size; sparse groups should be treated as directional.</p>
        </MethodSection>
        <MethodSection title="Comparisons">
          <p>Side-by-side market comparisons apply the shared availability, price, mileage, seller, and observation-window filters to both scopes. Price differences are descriptive and are not adjusted for equipment, condition, location, or changing vehicle mix.</p>
          <p>Listing-level market context uses the same make and model, model years within one year, and matching known fuel type and transmission. It compares asking prices with asking prices, or observed-sold listing prices with the same kind of evidence.</p>
        </MethodSection>
        <MethodSection title="Source detail and data quality">
          <p>Core fields can come from search results. Detail-page enrichment is optional and separately identified. Source labels are retained where possible, and the admin data-quality view reports latest-field coverage, parser versions, and parse failures.</p>
        </MethodSection>
        <MethodSection title="Known limitations">
          <ul>
            <li>A listing can change between observations or disappear before the next crawl.</li>
            <li>Seller-entered values can be incomplete or inconsistent.</li>
            <li>Observed-sold data can be sparse and must not be treated as registered sales data.</li>
            <li>Counts describe captured listing sets, not guaranteed point-in-time market inventory.</li>
          </ul>
        </MethodSection>
      </article>
    </main>
  );
}

function MethodSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
