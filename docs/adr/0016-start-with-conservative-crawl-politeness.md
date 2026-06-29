# Start with conservative Crawl Politeness

The crawler will start with conservative Crawl Politeness rather than aggressive
collection. Exact rate limits, concurrency, retry behavior, and cadence should be
iterated during implementation, but the initial posture should favor sustainable
coverage and avoiding source disruption over immediate completeness.
