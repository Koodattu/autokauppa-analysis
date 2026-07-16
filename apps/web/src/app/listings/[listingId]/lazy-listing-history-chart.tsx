"use client";

import dynamic from "next/dynamic";
import type { PublicListingDetailResponse } from "@/lib/api";
import { DeferredRender } from "../../deferred-render";

const ListingHistoryChart = dynamic(
  () => import("./listing-history-chart").then((module) => module.ListingHistoryChart),
  { ssr: false, loading: () => <ListingHistoryPlaceholder /> },
);

export function LazyListingHistoryChart({
  history,
}: {
  history: PublicListingDetailResponse["history"];
}) {
  return (
    <DeferredRender fallback={<ListingHistoryPlaceholder />}>
      <ListingHistoryChart history={history} />
    </DeferredRender>
  );
}

function ListingHistoryPlaceholder() {
  return (
    <div className="history-visual history-loading" role="status" aria-busy="true" aria-label="Loading listing history chart">
      <div className="history-chart skeleton-block" aria-hidden="true" />
    </div>
  );
}
