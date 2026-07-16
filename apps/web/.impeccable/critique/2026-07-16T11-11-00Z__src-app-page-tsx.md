---
target: apps/web/src/app/page.tsx post-redesign public multi-view
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-07-16T11-11-00Z
slug: src-app-page-tsx
---
⚠️ DEGRADED: single-context (two Assessment A sub-agents stalled after browser unavailability; the parent completed A before releasing isolated Assessment B)

# Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 4 | Loading, update, validation, freshness, completeness, and sample state are consistently visible. |
| 2 | Match System / Real World | 3 | Evidence language is careful, but English UI copy is mixed with Finnish dates, month names, and abbreviations. |
| 3 | User Control and Freedom | 3 | Reset and evidence links are strong; entering a listing detail loses the filtered listings context in the breadcrumb. |
| 4 | Consistency and Standards | 4 | Navigation, filters, tables, cards, charts, and states use one predictable component vocabulary. |
| 5 | Error Prevention | 4 | Conflicting year controls and invalid ranges are prevented, explained, associated, and focused. |
| 6 | Recognition Rather Than Recall | 3 | Applied scope is visible on analysis/listings, but disappears on listing detail and cannot be recovered through the breadcrumb. |
| 7 | Flexibility and Efficiency | 3 | Query URLs, advanced filters, sort options, and exact tables support repeat analysis; cohort comparison remains sequential. |
| 8 | Aesthetic and Minimalist Design | 4 | The restrained analytical hierarchy is purposeful and avoids decorative dashboard theater. |
| 9 | Error Recovery | 3 | Model loading, validation, empty, and page-error recovery are clear; context recovery after inspecting evidence is incomplete. |
| 10 | Help and Documentation | 3 | Inline definitions and coverage context are excellent; a dedicated methodology/locale decision is still absent. |
| **Total** |  | **34/40** | **Good — release-ready foundation with focused follow-ups.** |

# Anti-Patterns Verdict

**LLM assessment:** This does not read as generic AI-generated UI. The integrated snapshot, visible evidence qualifications, restrained teal, compact controls, exact-data disclosures, and consistent desktop/mobile structure feel deliberately shaped for a market-analysis product. Cards are used as working containers rather than decorative repetition, and the interface avoids gradient text, glass, oversized radii, numbered scaffolding, ornamental motion, and hero-metric theater.

**Deterministic scan:** The isolated Assessment B ran the detector once against apps/web/src/app/page.tsx and apps/web/src/app/listings. It exited 0 with an empty JSON array: zero findings, zero rules, zero locations, and no false positives.

**Visual overlays:** No reliable user-visible overlay exists. Browser selection was unavailable inside Assessment B, and the parent’s later mutable-injection preflight was blocked by the browser URL security policy. No live server was started and no overlay is claimed. The fallback was fresh parent-session inspection of the analysis, filtered analysis, listings, and detail routes at 320, 390, 768, and 1280px, with DOM snapshots, screenshots, geometry, semantics, and contrast measurements.

# Overall Impression

The redesign is a large improvement and is now credible as a public analytical product. It leads with a market question, qualifies evidence before users over-trust it, and creates a clear path from aggregate pattern to individual listings. The single biggest remaining opportunity is continuity: preserve the selected market scope as users move into and back out of listing evidence.

# What’s Working

- **Trust is designed into the answer.** Freshness, completeness, sample size, source basis, observed-sold caveats, and vehicle-mix caveats appear next to the values they qualify.
- **The broad-to-specific flow is clear.** Filters, applied-scope chips, trend insight, comparison charts, listings, and listing history form a coherent investigation rather than a collection of dashboard widgets.
- **Responsive and semantic fundamentals are strong.** No horizontal overflow or heading overflow appeared at 320–1280px; listings switch from table to cards; controls are labeled; heading order is coherent; contrast samples passed 4.5:1; and charts expose legends and exact tables in most views.

# Priority Issues

## [P2] Listing detail breaks the filtered investigation

**What:** Listing links navigate to a bare /listings/{id} URL and the detail breadcrumb returns to bare /listings. The active make/model/year scope is discarded.

**Why it matters:** Buyers and analysts inspecting several examples must use browser Back or reconstruct the query. This creates a working-memory bridge at the exact point where the product promises a continuous path from aggregate insight to underlying evidence.

**Fix:** Preserve a validated internal return URL or the public filter query when linking into detail. Label the return action with context, for example “Back to 1,284 Honda Civic results,” and preserve pagination/sort where appropriate.

**Suggested command:** $impeccable harden

## [P2] The interface speaks two languages at once

**What:** Visible UI labels are English while shared formatters and chart axes hard-code fi-FI, producing Finnish month names, “klo,” and Finnish compact-number abbreviations inside English sentences.

**Why it matters:** The hybrid reads as accidental and slightly undermines the otherwise precise, trustworthy voice. It also makes future localization harder because language choice is split between copy and formatting code.

**Fix:** Choose English, Finnish, or an explicit locale switch. Route all visible copy and Intl formatting through the same locale source; do not hard-code grammar-bearing date/time tokens independently.

**Suggested command:** $impeccable clarify

## [P2] Mobile users wait too long for the primary answer

**What:** On a 390px view, the complete filter surface, four vertically stacked snapshot metrics, and coverage block precede “Price direction.” The page measured roughly 5,000px tall.

**Why it matters:** A user asking “Are Civic prices rising or falling?” must cross several screens before reaching the direct answer. The information is relevant, but its mobile order conflicts with the principle of making the primary trend understandable before secondary detail.

**Fix:** Move a compact market-signal answer immediately after the submitted scope, then place snapshot and full coverage context below it. Consider a two-column compact metric layout where it remains readable, while keeping the full evidence available.

**Suggested command:** $impeccable adapt

## [P2] A few chart and async states fall short of the otherwise strong accessibility baseline

**What:** The historical price chart has a summary but no period-by-period exact-data table; listing-history asking and observed-sold price lines share the same solid-line/marker treatment; p25–p75 bands use a very light fill without a persistent boundary; and model-option loading is visually shown by a disabled select but not announced.

**Why it matters:** Screen-reader and color-vision users receive less complete or less distinguishable evidence than sighted users. The adjacent listing-history table and existing summaries mitigate the impact, so this is not a blocker, but these gaps are conspicuous because the rest of the implementation is careful.

**Fix:** Add a historical exact-data disclosure, use a dashed line or distinct marker for observed-sold history, give the interquartile band a durable non-color boundary/cue, and announce model loading/success with aria-busy plus a polite status.

**Suggested command:** $impeccable audit

# Persona Red Flags

**Alex — power user / analyst:** Filters and shareable query URLs are efficient, but Alex cannot open several listings and use the in-product breadcrumb without losing the comparison scope. Side-by-side cohort comparison is still a manual, sequential workflow.

**Sam — accessibility-dependent user:** Sam benefits from semantic controls, visible focus CSS, descriptive chart titles, legends, and exact tables. The remaining friction is concentrated in the one trend without an exact table, color-only history-price distinction, faint interquartile band, and unannounced model-option loading.

**Casey — distracted mobile buyer:** Controls are full-width, the layout has no horizontal overflow, and listing cards are readable. Casey’s main risk is abandonment before the answer: the direct price-direction insight sits several screens below filters, snapshot metrics, and coverage.

# Minor Observations

- Header navigation and standard form controls measure 40–42px high rather than the project’s aspirational 44px touch baseline. They exceed WCAG 2.5.8’s 24px minimum and were not treated as a conformance failure.
- “First observed” shares the activity chart’s axis with much larger stacked availability totals, making the line visually compressed; the exact table mitigates this.
- Inter remains declared but unbundled, so the system fallback determines actual metrics; DESIGN.md already documents this.
- The gallery bypasses Next image optimization, and the public theme still duplicates many literal color roles. These are technical audit follow-ups rather than visual redesign problems.

# Questions to Consider

- Should the product’s public language be English, Finnish, or user-selectable?
- When someone opens a listing from a filtered market, should the detail page remain explicitly inside that investigation or behave as a standalone listing record?
- On mobile, is the first promised answer the trend direction, the current market snapshot, or the underlying listings?
