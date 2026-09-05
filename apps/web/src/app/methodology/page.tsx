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
          <p>Price research supports independent vehicle filters and observation windows for two groups. Model year describes the car; observation dates describe when we captured its price. A historical window uses the latest complete collection for each search within that window, rather than an average of every listing seen during the year.</p>
          <p>Historical filters use snapshots recorded at or before each sighting. Period differences describe group medians, not depreciation of the same cars or the isolated effect of an equipment feature. The vehicle mix, condition, location and unrecorded equipment can differ. Fewer than five priced listings on either side suppresses the headline difference.</p>
          <p>Listing-level comparisons exclude the selected car. They use the same make, model and availability, model years within one year, mileage within the larger of 25,000 km or 20%, and matching known fuel, transmission and body style. Unknown fuel, transmission or body style relaxes that criterion and is disclosed. A valid model year and mileage are required. Asking prices and observed-sold listing prices are compared separately.</p>
        </MethodSection>
        <MethodSection title="Overview and activity">
          <p>The overview separates latest active listings from the observed-sold archive. Activity covers the seven days ending at the latest active observation. First observed means first captured by this dataset; an initial import can include older ads. Price reductions require a lower recorded asking price than an earlier observation.</p>
          <p>Feature summaries show the priced sample and its median mileage and model year. The scatter plot shows up to 300 consistently sampled listings; aggregate summaries use the full matching sample. Saved searches and the four-car shortlist stay in this browser. Shared links contain filters or listing IDs, and their latest results can change.</p>
        </MethodSection>
        <MethodSection title="Source detail and data quality">
          <p>Core fields can come from search results. Detail-page enrichment is optional and separately identified. Source labels are retained where possible, and the admin data-quality view reports latest-field coverage, parser versions, and parse failures.</p>
          <p>Recognized fuel and transmission labels are grouped consistently; unrecognized labels count as unknown. New detail enrichment creates a dated snapshot without rewriting earlier observations. Legacy snapshots may contain details enriched later, so older attribute history has that limitation.</p>
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
