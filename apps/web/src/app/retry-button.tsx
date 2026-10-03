"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>
    {pending ? "Trying again…" : "Try again"}
  </button>;
}
