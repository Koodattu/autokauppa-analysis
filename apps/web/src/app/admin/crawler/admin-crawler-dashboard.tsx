"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminCrawlerDiagnosticsResponse,
  AdminCrawlerRunTarget,
  AdminCrawlerStatusResponse,
  AdminDetailBackfillStatusResponse,
} from "@/lib/api";
import {
  parseAdminCrawlerControl,
  parseAdminCrawlerDiagnostics,
  parseAdminCrawlerRun,
  parseAdminCrawlerStatus,
  parseAdminDetailBackfillStart,
  parseAdminDetailBackfillControl,
  parseAdminDetailBackfillStatus,
} from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { SiteHeader } from "../../site-header";

type Notice = {
  kind: "success" | "error";
  message: string;
};

type AdminCrawlerDashboardProps = {
  initialStatus: AdminCrawlerStatusResponse;
  initialDetailBackfill: AdminDetailBackfillStatusResponse;
  initialNotice: Notice | null;
};

const POLL_INTERVAL_MS = 20_000;

export function AdminCrawlerDashboard({
  initialStatus,
  initialDetailBackfill,
  initialNotice,
}: AdminCrawlerDashboardProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [detailBackfill, setDetailBackfill] = useState(initialDetailBackfill);
  const [diagnostics, setDiagnostics] = useState<AdminCrawlerDiagnosticsResponse | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsPending, setDiagnosticsPending] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(new Date());
  const [notice, setNotice] = useState<Notice | null>(initialNotice);
  const [pollError, setPollError] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [controlPending, setControlPending] = useState(false);
  const [detailBackfillPending, setDetailBackfillPending] = useState(false);
  const [selectedCrawlTarget, setSelectedCrawlTarget] = useState<AdminCrawlerRunTarget>("all");
  const canRunCrawler = status.crawlerState.enabled && !status.crawlerState.paused && !runPending;
  const problemCount = useMemo(
    () =>
      status.queueBacklog.failedJobs +
      (diagnostics?.failureCounts.reduce((sum, failure) => sum + failure.count, 0) ?? 0) +
      (diagnostics?.latestSourceFetchFailures.length ?? 0) +
      (diagnostics?.latestParserErrorSummaries.length ?? 0) +
      (diagnostics?.latestFailedJobs.length ?? 0),
    [diagnostics, status.queueBacklog.failedJobs],
  );

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timeout: number | undefined;

    async function poll() {
      if (!active || inFlight) {
        return;
      }
      if (document.hidden) {
        timeout = window.setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      inFlight = true;
      try {
        const [nextStatus, nextDetailBackfill] = await Promise.all([
          fetchCrawlerStatus(() => router.push("/admin/login")),
          fetchDetailBackfillStatus(() => router.push("/admin/login")),
        ]);
        if (!active) {
          return;
        }
        setStatus(nextStatus);
        setDetailBackfill(nextDetailBackfill);
        setLastUpdatedAt(new Date());
        setPollError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setPollError(error instanceof Error ? error.message : "Status refresh failed.");
      } finally {
        inFlight = false;
        if (active) {
          timeout = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden && !inFlight) {
        window.clearTimeout(timeout);
        void poll();
      }
    }

    timeout = window.setTimeout(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  useEffect(() => {
    let active = true;
    void fetchCrawlerDiagnostics(() => router.push("/admin/login"))
      .then((nextDiagnostics) => {
        if (active) {
          setDiagnostics(nextDiagnostics);
          setDiagnosticsError(null);
        }
      })
      .catch((error) => {
        if (active) {
          setDiagnosticsError(error instanceof Error ? error.message : "Diagnostics could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setDiagnosticsPending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function refreshDiagnostics() {
    setDiagnosticsPending(true);
    try {
      setDiagnostics(await fetchCrawlerDiagnostics(() => router.push("/admin/login")));
      setDiagnosticsError(null);
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : "Diagnostics could not be loaded.");
    } finally {
      setDiagnosticsPending(false);
    }
  }

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
        router.push("/admin/login");
        return;
      }

      if (!response.ok) {
        setNotice({ kind: "error", message: formatRunError(await readRunError(response)) });
        return;
      }

      const body = parseAdminCrawlerRun(await response.json());
      setNotice({
        kind: "success",
        message: `Crawl queued for ${labelRunTarget(body.crawlKind)}${body.jobId ? ` as job ${body.jobId}` : ""}.`,
      });
      try {
        setStatus(await fetchCrawlerStatus(() => router.push("/admin/login")));
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

  async function startDetailBackfill() {
    setDetailBackfillPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/crawler/detail-backfill", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!response.ok) {
        setNotice({ kind: "error", message: formatRunError(await readRunError(response)) });
        return;
      }

      const body = parseAdminDetailBackfillStart(await response.json());
      setNotice({
        kind: "success",
        message: `Capped missing/v1 detail backfill queued${body.jobId ? ` as job ${body.jobId}` : ""}.`,
      });
      setDetailBackfill(await fetchDetailBackfillStatus(() => router.push("/admin/login")));
      setLastUpdatedAt(new Date());
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Detail backfill could not be queued.",
      });
    } finally {
      setDetailBackfillPending(false);
    }
  }

  async function controlDetailBackfill(action: "pause" | "resume" | "cancel") {
    if (
      action === "cancel"
      && !window.confirm("Cancel this detail backfill and remove its queued listing jobs?")
    ) {
      return;
    }

    setDetailBackfillPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/crawler/detail-backfill/control", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!response.ok) {
        setNotice({ kind: "error", message: formatRunError(await readRunError(response)) });
        return;
      }

      parseAdminDetailBackfillControl(await response.json());
      setNotice({
        kind: "success",
        message: action === "pause"
          ? "Detail backfill paused. Already queued bounded jobs will retire without fetching."
          : action === "resume"
            ? "Detail backfill resumed with bounded dispatch."
            : "Detail backfill cancellation queued.",
      });
      setDetailBackfill(await fetchDetailBackfillStatus(() => router.push("/admin/login")));
      setLastUpdatedAt(new Date());
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Detail backfill control failed.",
      });
    } finally {
      setDetailBackfillPending(false);
    }
  }

  async function updateCrawlerControl(action: "pause" | "resume") {
    setControlPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/crawler/control", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ action, crawlKind: selectedCrawlTarget }),
      });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!response.ok) {
        setNotice({ kind: "error", message: formatRunError(await readRunError(response)) });
        return;
      }
      const body = parseAdminCrawlerControl(await response.json());
      setNotice({
        kind: "success",
        message: action === "pause"
          ? `${labelRunTarget(body.crawlKind)} paused until ${formatDate(body.pausedUntil)}.`
          : `${labelRunTarget(body.crawlKind)} resumed.`,
      });
      setStatus(await fetchCrawlerStatus(() => router.push("/admin/login")));
      setLastUpdatedAt(new Date());
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Crawler control could not be updated.",
      });
    } finally {
      setControlPending(false);
    }
  }

  return (
    <main className="shell">
      <SiteHeader active="admin" />
      <header className="page-heading admin-heading">
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
          <button
            type="button"
            className="secondary-button"
            disabled={controlPending}
            onClick={() => updateCrawlerControl("pause")}
          >
            Pause 6 hours
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={controlPending}
            onClick={() => updateCrawlerControl("resume")}
          >
            Resume
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
        <Metric
          label="Detail jobs"
          value={status.crawlerState.detailEnabled ? `Up to ${status.crawlerState.detailMaxPerRun}` : "Disabled"}
        />
        <Metric label="Pending jobs" value={String(status.queueBacklog.pendingJobs)} />
        <Metric label="Problems" value={String(problemCount)} tone={problemCount > 0 ? "danger" : "default"} />
      </section>

      <DetailBackfillPanel
        backfill={detailBackfill}
        delayMs={status.crawlerState.delayMs}
        pending={detailBackfillPending}
        canStart={
          status.crawlerState.enabled
          && !status.crawlerState.paused
          && !detailBackfill.active
          && !detailBackfillPending
        }
        onStart={startDetailBackfill}
        onControl={controlDetailBackfill}
      />

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
                detail={segment.pausedUntil
                  ? `paused until ${formatDate(segment.pausedUntil)} · ${segment.pauseReason ?? "no reason"}`
                  : freshnessDetail(status, segment)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="diagnostics-heading">
        <div>
          <h2>Diagnostics</h2>
          <span>Loaded separately from live health</span>
        </div>
        <button className="secondary-button" type="button" disabled={diagnosticsPending} onClick={refreshDiagnostics}>
          {diagnosticsPending ? "Loading…" : "Refresh diagnostics"}
        </button>
      </div>
      {diagnosticsError ? <p className="notice error-state">{diagnosticsError}</p> : null}
      {diagnostics ? <DataQualityPanel quality={diagnostics.dataQuality} /> : null}
      {diagnostics ? <section className="admin-grid">
        <ErrorPanel
          title="Crawl failures · 30 days"
          emptyText="No failed or partial crawl runs."
          items={diagnostics.failureCounts.map((failure) => ({
            key: failure.failureReason,
            label: failure.failureReason,
            meta: `${failure.count} run${failure.count === 1 ? "" : "s"}`,
          }))}
        />
        <ErrorPanel
          title="Source fetch errors"
          emptyText="No recent source fetch errors."
          items={diagnostics.latestSourceFetchFailures.map((failure, index) => ({
            key: `${failure.fetchedAt}-${failure.sourceUrl}-${index}`,
            label: failure.errorType,
            meta: `${failure.fetchKind}${failure.pageNumber ? ` page ${failure.pageNumber}` : ""} · ${formatDate(failure.fetchedAt)} · HTTP ${failure.responseStatus ?? "-"}`,
            detail: [
              failure.errorMessage ?? failure.sourceUrl,
              formatSourceResponseDiagnostics(failure.responseDiagnostics),
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
        <ErrorPanel
          title="Parser errors"
          emptyText="No recent parser errors."
          items={diagnostics.latestParserErrorSummaries.map((failure, index) => ({
            key: `${failure.capturedAt}-${index}`,
            label: failure.parserVersion,
            meta: formatDate(failure.capturedAt),
            detail: failure.parseError,
          }))}
        />
        <ErrorPanel
          title="Failed worker jobs"
          emptyText="No failed worker jobs."
          items={diagnostics.latestFailedJobs.map((job) => ({
            key: job.id,
            label: job.taskIdentifier,
            meta: `${job.attempts}/${job.maxAttempts} attempts · ${formatDate(job.updatedAt ?? job.createdAt)}`,
            detail: job.lastError ?? `run at ${formatDate(job.runAt)}`,
          }))}
        />
      </section> : diagnosticsPending ? <div className="panel diagnostics-loading">Loading diagnostics…</div> : null}

      <section className="table-wrap admin-table-wrap">
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

function DetailBackfillPanel({
  backfill,
  delayMs,
  pending,
  canStart,
  onStart,
  onControl,
}: {
  backfill: AdminDetailBackfillStatusResponse;
  delayMs: number;
  pending: boolean;
  canStart: boolean;
  onStart: () => void;
  onControl: (action: "pause" | "resume" | "cancel") => void;
}) {
  const [confirmingStart, setConfirmingStart] = useState(false);
  const run = backfill.latestRun;
  const runIsActive = run
    ? ["planned", "running", "queued", "blocked", "paused", "cancelling"].includes(run.status)
    : false;
  const displayStatus = backfill.schedulerQueued && !runIsActive
    ? "queueing"
    : run?.status ?? "not started";
  const progressPercentage = !run || run.targetCount === 0
    ? 0
    : Math.min(100, Math.round((run.parsedCount / run.targetCount) * 1_000) / 10);
  const completedCount = run
    ? run.parsedCount + run.unavailableCount + run.failedCount + run.cancelledCount
    : 0;
  const completionPercentage = !run || run.targetCount === 0
    ? 0
    : Math.min(100, Math.round((completedCount / run.targetCount) * 1_000) / 10);
  const canPause = Boolean(run && ["planned", "running", "queued", "blocked"].includes(run.status));
  const canResume = Boolean(run && (
    ["paused", "blocked"].includes(run.status) || run.recoveryRequired
  ));
  const canCancel = Boolean(runIsActive && run?.status !== "cancelling");

  return (
    <section className="panel detail-backfill-panel">
      <div className="panel-heading">
        <div>
          <h2>Missing/v1 detail backfill</h2>
          <p>
            Refetches every listing without parsed detail data or with only v1 data, then parses it
            with v4. Requests are individual and rate-spaced.
          </p>
        </div>
        <StatusBadge tone={statusTone(displayStatus)}>{displayStatus}</StatusBadge>
      </div>

      <div className="data-quality-summary detail-backfill-summary">
        <Metric label="Target" value={run ? formatNumber(run.targetCount) : "Not calculated"} />
        <Metric label="Dispatched" value={run ? formatNumber(run.scheduledCount) : "0"} />
        <Metric label="Parsed v4" value={run ? formatNumber(run.parsedCount) : "0"} />
        <Metric label="Remaining" value={run ? formatNumber(run.remainingCount) : "-"} />
        <Metric label="Queued window" value={run ? formatNumber(run.queuedCount) : "0"} />
        <Metric label="Attempts" value={run ? formatNumber(run.attemptedCount) : "0"} />
        <Metric label="Unavailable" value={run ? formatNumber(run.unavailableCount) : "0"} />
        <Metric
          label="Failed"
          value={run ? formatNumber(run.failedCount) : "0"}
          tone={run && run.failedCount > 0 ? "danger" : "default"}
        />
      </div>

      {run ? (
        <div className="detail-backfill-progress">
          <progress max={100} value={completionPercentage}>{completionPercentage}%</progress>
          <span>{formatNumber(completionPercentage)}% completed · {formatNumber(progressPercentage)}% parsed</span>
        </div>
      ) : null}

      {run?.recoveryRequired ? (
        <p className="notice error-state">
          This is the legacy unbounded run with {formatNumber(run.legacyJobCount)} old worker jobs.
          Resume rebuilds it with the bounded target ledger; old jobs are retired without contacting
          Nettiauto.
        </p>
      ) : null}
      {run?.status === "blocked" && run.blockReason ? (
        <p className="notice error-state">
          Circuit breaker open: {formatBackfillReason(run.blockReason)}
          {run.blockedUntil ? ` · next single probe after ${formatDate(run.blockedUntil)}` : ""}
        </p>
      ) : null}
      {run?.status === "paused" && run.blockReason ? (
        <p className="notice">{formatBackfillReason(run.blockReason)}</p>
      ) : null}
      {confirmingStart && !runIsActive ? (
        <div className="notice detail-backfill-confirmation" role="group" aria-label="Confirm detail backfill">
          <p>
            Queue a rate-spaced v4 detail refetch for the configured number of missing or v1-only
            listings?
          </p>
          <div className="topbar-actions">
            <button
              type="button"
              disabled={!canStart}
              onClick={() => {
                setConfirmingStart(false);
                onStart();
              }}
            >
              Confirm queue
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => setConfirmingStart(false)}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <div className="detail-backfill-actions">
        <div>
          <strong>
            {run?.remainingCount
              ? `Minimum remaining runtime at the current delay: ${formatBackfillDuration(run.remainingCount, delayMs)}`
              : `Current request spacing: ${formatNumber(delayMs)} ms`}
          </strong>
          <span>
            The total run is capped by DETAIL_BACKFILL_TARGET_LIMIT; its queued window is capped by
            DETAIL_BACKFILL_BATCH_SIZE. A source block stops dispatch and schedules one probe after
            the cooldown. Hero downloads follow HERO_IMAGE_ARCHIVE_ENABLED.
          </span>
        </div>
        <div className="topbar-actions">
          {!runIsActive && !confirmingStart ? (
            <button type="button" disabled={!canStart} onClick={() => setConfirmingStart(true)}>
              {pending ? "Queueing…" : "Queue v4 detail backfill"}
            </button>
          ) : null}
          {canPause ? (
            <button type="button" className="secondary-button" disabled={pending} onClick={() => onControl("pause")}>
              Pause backfill
            </button>
          ) : null}
          {canResume ? (
            <button type="button" disabled={pending} onClick={() => onControl("resume")}>
              {run?.recoveryRequired ? "Recover bounded run" : "Resume backfill"}
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" className="secondary-button" disabled={pending} onClick={() => onControl("cancel")}>
              Cancel backfill
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DataQualityPanel({ quality }: { quality: AdminCrawlerDiagnosticsResponse["dataQuality"] }) {
  const detailCoverage = quality.totalListings === 0
    ? 0
    : Math.round((quality.detailEnrichedListings / quality.totalListings) * 1_000) / 10;
  return (
    <section className="panel data-quality-panel">
      <div className="panel-heading">
        <div>
          <h2>Data quality</h2>
          <p>Coverage of the latest listing snapshot and parser activity from the last 30 days.</p>
        </div>
        <span>{formatNumber(quality.totalListings)} listings</span>
      </div>
      <div className="data-quality-summary">
        <Metric label="Detail enriched" value={`${formatNumber(quality.detailEnrichedListings)} · ${formatNumber(detailCoverage)}%`} />
        <Metric label="Raw records · 30 days" value={formatNumber(quality.rawRecordsLast30Days)} />
        <Metric
          label="Failed parses · 30 days"
          value={formatNumber(quality.failedRawRecordsLast30Days)}
          tone={quality.failedRawRecordsLast30Days > 0 ? "danger" : "default"}
        />
      </div>
      <div className="data-quality-grid">
        <div>
          <h3>Latest-field coverage</h3>
          <ul className="coverage-list">
            {quality.fieldCoverage.map((field) => (
              <li key={field.field}>
                <span>{field.field}</span>
                <progress max={100} value={field.percentage}>{field.percentage}%</progress>
                <strong>{formatNumber(field.percentage)}%</strong>
                <small>{formatNumber(field.presentCount)}</small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Parser versions · 30 days</h3>
          {quality.parserVersions.length === 0 ? <p className="muted">No raw records captured.</p> : (
            <div className="trend-list">
              {quality.parserVersions.map((version) => (
                <AdminRow
                  key={version.parserVersion}
                  label={version.parserVersion}
                  value={formatNumber(version.recordCount)}
                  detail={`${formatNumber(version.failedCount)} failed · latest ${formatDate(version.latestCapturedAt)}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

async function fetchCrawlerStatus(onUnauthorized: () => void) {
  const response = await fetch("/api/admin/crawler/status", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new Error("Sign in required.");
  }

  if (!response.ok) {
    throw new Error(`Status refresh failed with HTTP ${response.status}.`);
  }

  return parseAdminCrawlerStatus(await response.json());
}

async function fetchCrawlerDiagnostics(onUnauthorized: () => void) {
  const response = await fetch("/api/admin/crawler/diagnostics", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new Error("Sign in required.");
  }
  if (!response.ok) {
    throw new Error(`Diagnostics refresh failed with HTTP ${response.status}.`);
  }

  return parseAdminCrawlerDiagnostics(await response.json());
}

async function fetchDetailBackfillStatus(onUnauthorized: () => void) {
  const response = await fetch("/api/admin/crawler/detail-backfill", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new Error("Sign in required.");
  }
  if (!response.ok) {
    throw new Error(`Detail backfill refresh failed with HTTP ${response.status}.`);
  }

  return parseAdminDetailBackfillStatus(await response.json());
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
  if (status === "completed" || status === "not started") {
    return "default";
  }

  if (["partial", "running", "planned", "queued", "queueing", "blocked", "paused", "cancelling"].includes(status)) {
    return "warning";
  }

  return "danger";
}

function formatBackfillDuration(targetCount: number, delayMs: number) {
  const totalHours = Math.ceil((targetCount * delayMs) / (60 * 60 * 1_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) {
    return `${hours} h`;
  }
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
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

function formatSourceResponseDiagnostics(diagnostics: Record<string, string> | null) {
  if (!diagnostics) {
    return "";
  }

  return [
    diagnostics.transport ? `transport ${diagnostics.transport}` : null,
    diagnostics.title ? `title ${diagnostics.title}` : null,
    diagnostics.server ? `server ${diagnostics.server}` : null,
    diagnostics.cfRay ? `ray ${diagnostics.cfRay}` : null,
    diagnostics.retryAfter ? `retry after ${diagnostics.retryAfter}` : null,
    diagnostics.location ? `location ${diagnostics.location}` : null,
    diagnostics.solverMessage ? `solver ${diagnostics.solverMessage}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
    case "detail_backfill_active":
      return "A missing/v1 detail backfill is already active.";
    case "detail_backfill_not_active":
      return "No active detail backfill was found.";
    case "invalid_request":
      return "Choose a valid crawl job and try again.";
    default:
      return "Crawler run could not be queued.";
  }
}

function formatBackfillReason(reason: string) {
  switch (reason) {
    case "blocked":
      return "Nettiauto is refusing detail requests (HTTP 403).";
    case "rate_limited":
      return "Nettiauto rate-limited detail requests (HTTP 429).";
    case "redirected":
      return "Nettiauto redirected detail requests unexpectedly.";
    case "unexpected_response_body_shape":
      return "Nettiauto returned an unexpected detail response.";
    case "crawler_disabled":
      return "The crawler is disabled on the worker.";
    case "crawler_paused":
      return "The crawler is paused on the worker.";
    case "operator_paused":
      return "Paused by an administrator.";
    default:
      return reason.replaceAll("_", " ");
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
