"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminCrawlerRunResponse,
  AdminCrawlerRunTarget,
  AdminCrawlerStatusResponse,
} from "@/lib/api";

type Notice = {
  kind: "success" | "error";
  message: string;
};

type AdminCrawlerDashboardProps = {
  initialStatus: AdminCrawlerStatusResponse;
  initialNotice: Notice | null;
};

const POLL_INTERVAL_MS = 5_000;

export function AdminCrawlerDashboard({
  initialStatus,
  initialNotice,
}: AdminCrawlerDashboardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(new Date());
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const [pollError, setPollError] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [selectedCrawlTarget, setSelectedCrawlTarget] = useState<AdminCrawlerRunTarget>("all");
  const canRunCrawler = status.crawlerState.enabled && !status.crawlerState.paused && !runPending;
  const problemCount = useMemo(
    () =>
      status.queueBacklog.failedJobs +
      status.failureCounts.reduce((sum, failure) => sum + failure.count, 0) +
      status.latestSourceFetchFailures.length +
      status.latestParserErrorSummaries.length +
      status.latestFailedJobs.length,
    [status],
  );

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const nextStatus = await fetchCrawlerStatus();
        if (!active) {
          return;
        }
        setStatus(nextStatus);
        setLastUpdatedAt(new Date());
        setPollError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setPollError(error instanceof Error ? error.message : "Status refresh failed.");
      }
    }

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function runCrawlerNow() {
    setRunPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/crawler/run", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ crawlKind: selectedCrawlTarget }),
      });

      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }

      if (!response.ok) {
        setNotice({ kind: "error", message: formatRunError(await readRunError(response)) });
        return;
      }

      const body = (await response.json()) as AdminCrawlerRunResponse;
      setNotice({
        kind: "success",
        message: `Crawl queued for ${labelRunTarget(body.crawlKind)}${body.jobId ? ` as job ${body.jobId}` : ""}.`,
      });
      try {
        setStatus(await fetchCrawlerStatus());
        setLastUpdatedAt(new Date());
        setPollError(null);
      } catch (error) {
        setPollError(error instanceof Error ? error.message : "Status refresh failed.");
      }
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Crawler run could not be queued.",
      });
    } finally {
      setRunPending(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Crawler status</h1>
          <p className="topbar-meta">
            <span className="live-dot" aria-hidden="true" />
            Live
            <span>{lastUpdatedAt ? `Updated ${formatTime(lastUpdatedAt.toISOString())}` : "Not updated"}</span>
          </p>
        </div>
        <div className="topbar-actions">
          <label className="run-target-field">
            Crawl job
            <select
              value={selectedCrawlTarget}
              disabled={runPending}
              onChange={(event) => setSelectedCrawlTarget(event.target.value as AdminCrawlerRunTarget)}
            >
              <option value="all">All enabled crawls</option>
              <option value="current">Current listings</option>
              <option value="sold">Sold listings</option>
            </select>
          </label>
          <button type="button" disabled={!canRunCrawler} onClick={runCrawlerNow}>
            {runPending ? "Queueing..." : "Run crawl now"}
          </button>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="secondary-button">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {notice ? (
        <p className={`notice ${notice.kind === "error" ? "error-state" : ""}`}>{notice.message}</p>
      ) : null}
      {pollError ? <p className="notice error-state">{pollError}</p> : null}
      {!status.crawlerState.enabled ? (
        <p className="notice error-state">Crawler is disabled by environment.</p>
      ) : status.crawlerState.paused ? (
        <p className="notice error-state">Crawler is paused by environment.</p>
      ) : null}

      <section className="metrics">
        <Metric label="Enabled" value={status.crawlerState.enabled ? "Yes" : "No"} />
        <Metric label="Paused" value={status.crawlerState.paused ? "Yes" : "No"} />
        <Metric label="Delay" value={`${status.crawlerState.delayMs} ms`} />
        <Metric label="Max pages" value={status.crawlerState.maxPagesPerRun === 0 ? "All" : String(status.crawlerState.maxPagesPerRun)} />
        <Metric label="Pending jobs" value={String(status.queueBacklog.pendingJobs)} />
        <Metric label="Problems" value={String(problemCount)} tone={problemCount > 0 ? "danger" : "default"} />
      </section>

      <section className="split">
        <div className="panel">
          <div className="panel-heading">
            <h2>Queue</h2>
            <StatusBadge tone={status.queueBacklog.failedJobs > 0 ? "danger" : "default"}>
              {status.queueBacklog.failedJobs > 0 ? "attention" : "ok"}
            </StatusBadge>
          </div>
          <div className="trend-list">
            <AdminRow label="Pending" value={String(status.queueBacklog.pendingJobs)} detail="ready" />
            <AdminRow label="Running" value={String(status.queueBacklog.lockedJobs)} detail="locked" />
            <AdminRow label="Failed" value={String(status.queueBacklog.failedJobs)} detail="dead jobs" />
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Freshness</h2>
          </div>
          <div className="trend-list">
            {status.freshnessBySegment.map((segment) => (
              <AdminRow
                key={segment.crawlKind}
                label={labelKind(segment.crawlKind)}
                value={formatDate(segment.lastSuccessAt)}
                detail={freshnessDetail(status, segment)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <ErrorPanel
          title="Crawl failures"
          emptyText="No failed or partial crawl runs."
          items={status.failureCounts.map((failure) => ({
            key: failure.failureReason,
            label: failure.failureReason,
            meta: `${failure.count} run${failure.count === 1 ? "" : "s"}`,
          }))}
        />
        <ErrorPanel
          title="Source fetch errors"
          emptyText="No recent source fetch errors."
          items={status.latestSourceFetchFailures.map((failure, index) => ({
            key: `${failure.fetchedAt}-${failure.sourceUrl}-${index}`,
            label: failure.errorType,
            meta: `${failure.fetchKind}${failure.pageNumber ? ` page ${failure.pageNumber}` : ""} · ${formatDate(failure.fetchedAt)} · HTTP ${failure.responseStatus ?? "-"}`,
            detail: failure.errorMessage ?? failure.sourceUrl,
          }))}
        />
        <ErrorPanel
          title="Parser errors"
          emptyText="No recent parser errors."
          items={status.latestParserErrorSummaries.map((failure, index) => ({
            key: `${failure.capturedAt}-${index}`,
            label: failure.parserVersion,
            meta: formatDate(failure.capturedAt),
            detail: failure.parseError,
          }))}
        />
        <ErrorPanel
          title="Failed worker jobs"
          emptyText="No failed worker jobs."
          items={status.latestFailedJobs.map((job) => ({
            key: job.id,
            label: job.taskIdentifier,
            meta: `${job.attempts}/${job.maxAttempts} attempts · ${formatDate(job.updatedAt ?? job.createdAt)}`,
            detail: job.lastError ?? `run at ${formatDate(job.runAt)}`,
          }))}
        />
      </section>

      <section className="table-wrap">
        <div className="section-heading">
          <h2>Recent runs</h2>
          <span>{status.recentRuns.length} shown</span>
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
                  <td>{labelKind(run.crawlKind)}</td>
                  <td>
                    <StatusBadge tone={statusTone(run.status)}>{run.status}</StatusBadge>
                  </td>
                  <td>{formatDate(run.startedAt)}</td>
                  <td>{formatDate(run.finishedAt)}</td>
                  <td>{run.fetchedPageCount}</td>
                  <td>{run.parsedListingCount}</td>
                  <td className="wrap">{run.failureReason ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

async function fetchCrawlerStatus() {
  const response = await fetch("/api/admin/crawler/status", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Sign in required.");
  }

  if (!response.ok) {
    throw new Error(`Status refresh failed with HTTP ${response.status}.`);
  }

  return response.json() as Promise<AdminCrawlerStatusResponse>;
}

async function readRunError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "request_failed";
  } catch {
    return "request_failed";
  }
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className={`metric ${tone === "danger" ? "metric-danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdminRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="trend-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function ErrorPanel({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: Array<{ key: string; label: string; meta: string; detail?: string }>;
}) {
  return (
    <div className={`panel ${items.length > 0 ? "error-state" : ""}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <StatusBadge tone={items.length > 0 ? "danger" : "default"}>{String(items.length)}</StatusBadge>
      </div>
      <div className="error-list">
        {items.length === 0 ? (
          <p className="muted">{emptyText}</p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="error-item">
              <strong>{item.label}</strong>
              <span>{item.meta}</span>
              {item.detail ? <p>{item.detail}</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "default" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

function statusTone(status: string) {
  if (status === "completed") {
    return "default";
  }

  if (status === "partial" || status === "running" || status === "planned") {
    return "warning";
  }

  return "danger";
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fi-FI", {
    timeStyle: "medium",
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
    case "invalid_request":
      return "Choose a valid crawl job and try again.";
    default:
      return "Crawler run could not be queued.";
  }
}

function labelRunTarget(value: AdminCrawlerRunTarget) {
  switch (value) {
    case "current":
      return "current listings";
    case "sold":
      return "sold listings";
    case "all":
      return "all enabled crawls";
  }
}

function freshnessDetail(
  status: AdminCrawlerStatusResponse,
  segment: AdminCrawlerStatusResponse["freshnessBySegment"][number],
) {
  const lastSuccess = status.lastSuccessfulCrawls.find((crawl) => crawl.crawlKind === segment.crawlKind);
  if (lastSuccess) {
    return `${lastSuccess.parsedListingCount} listings`;
  }

  if (segment.lastFailureAt) {
    return `last failure ${formatDate(segment.lastFailureAt)}`;
  }

  return segment.enabled ? "enabled" : "disabled";
}

function labelKind(value: string) {
  return value === "current" ? "Current" : value === "sold" ? "Sold" : value;
}
