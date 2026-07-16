"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export function DeferredRender({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const boundaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready) {
      return;
    }

    const reveal = () => setReady(true);
    const boundary = boundaryRef.current;
    if (!boundary || typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          reveal();
        }
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(boundary);

    let idleHandle: number | undefined;
    const fallbackTimer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(reveal, { timeout: 2_000 });
      } else {
        reveal();
      }
    }, 4_000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
      if (idleHandle !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [ready]);

  return <div ref={boundaryRef}>{ready ? children : fallback}</div>;
}
