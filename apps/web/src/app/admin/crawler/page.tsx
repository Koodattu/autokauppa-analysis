import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ApiError,
  apiGet,
  apiPath,
  type AdminCrawlerRunResponse,
  type AdminCrawlerStatusResponse,
} from "@/lib/api";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCrawlerPage({ searchParams }: PageProps) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const params = await searchParams;

  try {
    const status = await apiGet<AdminCrawlerStatusResponse>("/admin/crawler/status", {
      headers: { cookie },
    });
    const runStatus = single(params.runStatus);
    const runError = single(params.runError);
    const queuedJobId = single(params.jobId);
    const canRunCrawler = status.crawlerState.enabled && !status.crawlerState.paused;

    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>Crawler status</h1>
          </div>
          <div className="topbar-actions">
            <form action={runCrawlerNow}>
              <button type="submit" disabled={!canRunCrawler}>
                Run crawl now
              </button>
            </form>
            <form action="/api/admin/logout" method="post">
              <button type="submit" className="secondary-button">
                Sign out
              </button>
            </form>
          </div>
        </header>

        {runStatus === "queued" ? (
          <p className="notice">Crawl queued{queuedJobId ? ` as job ${queuedJobId}` : ""}.</p>
        ) : null}
        {runError ? <p className="notice error-state">{formatRunError(runError)}</p> : null}
        {!status.crawlerState.enabled ? (
          <p className="notice error-state">Crawler is disabled by environment.</p>
        ) : status.crawlerState.paused ? (
          <p className="notice error-state">Crawler is paused by environment.</p>
        ) : null}

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

async function runCrawlerNow() {
  "use server";

  const requestHeaders = await headers();
  const response = await fetch(apiPath("/admin/crawler/run"), {
    method: "POST",
    headers: {
      accept: "application/json",
      cookie: requestHeaders.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/admin/login");
  }

  if (!response.ok) {
    redirect(`/admin/crawler?runError=${encodeURIComponent(await readRunError(response))}`);
  }

  const body = (await response.json()) as AdminCrawlerRunResponse;
  redirect(
    `/admin/crawler?runStatus=queued${body.jobId ? `&jobId=${encodeURIComponent(body.jobId)}` : ""}`,
  );
}

async function readRunError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "request_failed";
  } catch {
    return "request_failed";
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

function formatRunError(error: string) {
  switch (error) {
    case "crawler_disabled":
      return "Crawler is disabled by environment.";
    case "crawler_paused":
      return "Crawler is paused by environment.";
    case "worker_not_ready":
      return "Worker queue is not ready yet.";
    default:
      return "Crawler run could not be queued.";
  }
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
