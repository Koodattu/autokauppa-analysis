import { headers } from "next/headers";
import Link from "next/link";
import { AdminCrawlerDashboard } from "./admin-crawler-dashboard";
import {
  ApiError,
  apiGet,
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

    return (
      <AdminCrawlerDashboard
        initialStatus={status}
        initialNotice={initialNotice(params)}
      />
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
