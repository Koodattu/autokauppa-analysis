import type { CoverageMetadata } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

export function MarketCoverage({
  coverage,
  title = "Data coverage",
}: {
  coverage: CoverageMetadata;
  title?: string;
}) {
  const status = coverageStatus(coverage.completeness);

  return (
    <section
      className={`market-coverage coverage-${coverage.completeness}`}
      aria-label={title}
      role={coverage.completeness === "complete" ? undefined : "status"}
    >
      <div className="coverage-summary">
        <span className="coverage-symbol" aria-hidden="true">
          {coverage.completeness === "complete" ? <CheckIcon /> : <InfoIcon />}
        </span>
        <div>
          <div className="coverage-title-row">
            <h2>{title}</h2>
            <span className={`status-badge ${status.tone}`}>{status.label}</span>
          </div>
          <p>{status.description}</p>
        </div>
      </div>

      <dl className="coverage-facts">
        <CoverageFact label="Updated through" value={formatDateTime(coverage.lastRelevantCrawlAt)} />
        <CoverageFact label="Sample" value={`${formatNumber(coverage.sampleSize)} listings`} />
        <CoverageFact label="Includes" value={includedListings(coverage)} />
        <CoverageFact label="Basis" value={dataBasis(coverage.dataSource)} />
      </dl>
    </section>
  );
}

function CoverageFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function coverageStatus(completeness: CoverageMetadata["completeness"]) {
  if (completeness === "complete") {
    return {
      label: "Collection complete",
      tone: "",
      description: "The latest collection finished. Individual attributes may still be missing; availability is only as recent as the observation date.",
    };
  }
  if (completeness === "partial") {
    return {
      label: "Partial",
      tone: "status-warning",
      description: "Some observations are missing. Treat small differences and short-term movement cautiously.",
    };
  }
  return {
    label: "Unconfirmed",
    tone: "status-warning",
    description: "Coverage could not be confirmed. Use this view as directional evidence only.",
  };
}

function includedListings(coverage: CoverageMetadata) {
  if (coverage.includesCurrent && coverage.includesSold) {
    return "Current and observed-sold";
  }
  if (coverage.includesCurrent) {
    return "Current listings";
  }
  if (coverage.includesSold) {
    return "Observed-sold listings";
  }
  return "No listings";
}

function dataBasis(source: CoverageMetadata["dataSource"]) {
  return source === "search_and_detail_data"
    ? "Listing and vehicle-detail observations"
    : "Listing observations";
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20">
      <path d="m5 10 3.1 3.1L15 6.7" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20">
      <path d="M10 8.1v6M10 5.7v.1" />
    </svg>
  );
}
