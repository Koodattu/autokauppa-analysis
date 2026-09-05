import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatasetOverview, getPriceResearch, getFilterMetadata, ApiError } from "@/lib/api";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { SiteHeader } from "./site-header";
import { MarketFilterForm, type PageSearchParams } from "./market-filter-form";
import { SavedWorkspace } from "./saved-workspace";

export default async function Home({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const legacy = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) legacy.append(key, item);
  }
  if (legacy.size) redirect(`/analyze?${legacy}`);
  let data;
  try { data = await Promise.all([getDatasetOverview(), getPriceResearch("?availability=current"), getFilterMetadata("")]); }
  catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return <main className="shell public-shell"><SiteHeader active="overview" /><section className="panel"><h1>Market data is temporarily unavailable</h1><p>Try again shortly.</p><Link href="/">Try again</Link></section></main>;
  }
  const [overview, research, filters] = data;
  return <main className="shell public-shell"><SiteHeader active="overview" />
    <section className="page-heading"><div className="heading-copy"><span className="heading-context">Observed Finnish used-car market</span><h1>Understand car prices</h1><p>Explore what cars cost, how mileage and features affect asking prices, and how the observed market changes.</p></div><Link className="button-link" href="/analyze">Research prices</Link></section>
    <section className="overview-metrics" aria-label="Dataset overview">
      <Link href="/listings"><span>Current listings</span><strong>{formatNumber(overview.current)}</strong><small>Latest observed availability</small></Link>
      <Link href="/analyze"><span>Median asking price</span><strong>{formatCurrency(overview.median)}</strong><small>Middle 50%: {formatCurrency(overview.p25)}–{formatCurrency(overview.p75)}</small></Link>
      <Link href="/listings?availability=current&sort=firstSeenDesc&activity=firstObserved"><span>First observed in 7 days</span><strong>{formatNumber(overview.firstObserved)}</strong><small>Current listings discovered by this dataset</small></Link>
      <Link href="/listings?availability=current&sort=priceReductionDesc&activity=priceReduced"><span>Recorded reductions in 7 days</span><strong>{formatNumber(overview.reduced)}</strong><small>Current cars with recorded asking-price reductions</small></Link>
    </section>
    <p className="overview-freshness">Current data last observed {formatDate(overview.updatedAt)}. Activity window: {formatDate(overview.activityFrom)}–{formatDate(overview.updatedAt)}. Newly discovered cars may include older advertisements or archive imports.</p>
    <div className="research-actions"><Link href="/analyze?availability=current&fuelType=Electric">Explore electric cars</Link><Link href="/analyze?availability=current&transmission=Manual">Manual transmission prices</Link><Link href="/listings?availability=current&priceMax=15000">Browse under €15,000</Link></div>
    <details className="panel overview-research-form"><summary>Choose a make, model, mileage or observation period</summary><MarketFilterForm action="/analyze" filters={filters} params={{ availability: "current" }} variant="analytics" /></details>
    <div className="research-feature-grid"><section className="panel"><h2>Browse by budget</h2><p>Current priced listings. Select a range to see the cars.</p><ul className="feature-groups">{research.priceBands.map((band) => <li key={band.from}><Link href={`/listings?availability=current&priceMin=${band.from}${band.to === null ? "" : `&priceMax=${band.to - 1}`}`}>{formatCurrency(band.from)}{band.to === null ? "+" : `–${formatCurrency(band.to)}`}</Link><strong>{formatNumber(band.count)} cars</strong></li>)}</ul></section>
    <section className="panel"><h2>Most listed models</h2><p>Current priced inventory, not a measure of demand or sales.</p><ul className="feature-groups">{research.models.map((model) => <li key={`${model.make}-${model.model}`}><Link href={`/analyze?${new URLSearchParams({ make: model.make, model: model.model, availability: "current" })}`}>{model.make} {model.model}</Link><strong>{formatCurrency(model.median)}</strong><small>{formatNumber(model.count)} prices · median asking</small></li>)}</ul></section>
    <section className="panel"><h2>Check a listing</h2><p>Open an advertisement already collected here to inspect its price history and comparable cars.</p><form className="lookup-form" action="/lookup"><label><span>Nettiauto URL or listing ID</span><input name="listing" required maxLength={300} placeholder="https://www.nettiauto.com/…" /></label><button>Find listing</button></form><h3>Explore earlier prices</h3><p>Collection history: {formatDate(overview.historyFrom)}–{formatDate(overview.historyTo)}.</p><p>{formatNumber(overview.archived)} observed-sold listings in the archive. These are not confirmed transactions.</p><Link href="/analyze">Choose cars and compare two periods</Link></section></div>
    <SavedWorkspace />
  </main>;
}
