import { headers } from "next/headers";
import Link from "next/link";
import { AdminCrawlerDashboard } from "./admin-crawler-dashboard";
import {
  ApiError,
  getAdminDetailBackfillStatus,
  getAdminCrawlerStatus,
} from "@/lib/api";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCrawlerPage({ searchParams }: PageProps) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const params = await searchParams;

  const result = await loadCrawlerData(cookie);
  if (!result.ok) {
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

  return (
    <AdminCrawlerDashboard
      initialStatus={result.status}
      initialDetailBackfill={result.detailBackfill}
      initialNotice={initialNotice(params)}
    />
  );
}

async function loadCrawlerData(cookie: string) {
  try {
    const [status, detailBackfill] = await Promise.all([
      getAdminCrawlerStatus({ headers: { cookie } }),
      getAdminDetailBackfillStatus({ headers: { cookie } }),
    ]);
    return { ok: true as const, status, detailBackfill };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { ok: false as const };
    }
    throw error;
  }
}

function initialNotice(searchParams: Record<string, string | string[] | undefined>) {
  const runStatus = single(searchParams.runStatus);
  const runError = single(searchParams.runError);
  const queuedJobId = single(searchParams.jobId);

  if (runStatus === "queued") {
    return {
      kind: "success" as const,
      message: `Crawl queued${queuedJobId ? ` as job ${queuedJobId}` : ""}.`,
    };
  }

  if (runError) {
    return {
      kind: "error" as const,
      message: formatRunError(runError),
    };
  }

  return null;
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
