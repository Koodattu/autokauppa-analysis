import { headers } from "next/headers";
import Link from "next/link";
import { ApiError, apiGet, type AdminCrawlerStatusResponse } from "@/lib/api";

export default async function AdminCrawlerPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";

  try {
    const status = await apiGet<AdminCrawlerStatusResponse>("/admin/crawler/status", {
      headers: { cookie },
    });

    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>Crawler status</h1>
          </div>
          <form action="/api/admin/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </header>

        <section className="metrics">
          <Metric label="Enabled" value={status.crawlerState.enabled ? "Yes" : "No"} />
          <Metric label="Paused" value={status.crawlerState.paused ? "Yes" : "No"} />
          <Metric label="Delay" value={`${status.crawlerState.delayMs} ms`} />
          <Metric label="Max pages" value={String(status.crawlerState.maxPagesPerRun)} />
          <Metric label="Pending jobs" value={String(status.queueBacklog.pendingJobs)} />
          <Metric label="Failed jobs" value={String(status.queueBacklog.failedJobs)} />
        </section>

        <section className="split">
          <div className="panel">
            <h2>Freshness</h2>
            <div className="trend-list">
              {status.freshnessBySegment.map((segment) => (
                <div key={segment.crawlKind} className="trend-row">
                  <span>{segment.crawlKind}</span>
                  <strong>{formatDate(segment.lastSuccessAt)}</strong>
                  <span>{segment.enabled ? "enabled" : "disabled"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>Last successful crawls</h2>
            <div className="trend-list">
              {status.lastSuccessfulCrawls.length === 0 ? (
                <p className="muted">No completed crawls yet.</p>
              ) : (
                status.lastSuccessfulCrawls.map((crawl) => (
                  <div key={crawl.crawlKind} className="trend-row">
                    <span>{crawl.crawlKind}</span>
                    <strong>{formatDate(crawl.finishedAt)}</strong>
                    <span>{crawl.parsedListingCount} listings</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="table-wrap">
          <div className="section-heading">
            <h2>Recent runs</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Pages</th>
                <th>Listings</th>
                <th>Failure</th>
              </tr>
            </thead>
            <tbody>
              {status.recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No crawl runs yet.
                  </td>
                </tr>
              ) : (
                status.recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{run.crawlKind}</td>
                    <td>{run.status}</td>
                    <td>{formatDate(run.startedAt)}</td>
                    <td>{formatDate(run.finishedAt)}</td>
                    <td>{run.fetchedPageCount}</td>
                    <td>{run.parsedListingCount}</td>
                    <td>{run.failureReason ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <main className="auth-shell">
          <section className="login-panel">
            <p className="eyebrow">Admin</p>
            <h1>Sign in required</h1>
            <Link className="button-link" href="/admin/login">
              Sign in
            </Link>
          </section>
        </main>
      );
    }

    throw error;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
