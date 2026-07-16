---
target: apps/web/src/app/page.tsx
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-07-16T08-00-53Z
slug: src-app-page-tsx
---
# Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3/4 | Updating, loading, freshness, and coverage states are visible, but dependent-model request failures are silent. |
| 2 | Match between system and the real world | 2/4 | Prices and mileage are familiar; “crawl,” “basis,” and “observed sold” require interpretation. |
| 3 | User control and freedom | 3/4 | Query-driven navigation and clearing exist, but reset is hidden and overlapping year controls can conflict. |
| 4 | Consistency and standards | 4/4 | Native links, selects, inputs, details, headings, and navigation are used consistently. |
| 5 | Error prevention | 2/4 | Exact year and year range can coexist, while numeric and date pairs lack visible cross-field validation. |
| 6 | Recognition rather than recall | 3/4 | Fields are labeled, but the page does not expose the complete active scope. |
| 7 | Flexibility and efficiency | 3/4 | Broad-to-specific filtering is strong; repeat or side-by-side cohort analysis is not supported. |
| 8 | Aesthetic and minimalist design | 3/4 | The palette is restrained, but equal-weight metrics and repeated bounded surfaces create generic dashboard weight. |
| 9 | Error recognition and recovery | 3/4 | Page-level recovery is clear; model-loading failure has neither an explanation nor retry path. |
| 10 | Help and documentation | 2/4 | Section descriptions help, but crucial evidence and sold-price semantics are not explained in public language. |
| **Total** |  | **28/40** | **Good foundation; major trust and interpretation issues remain.** |

# Anti-Patterns Verdict

**LLM assessment:** Mild AI-dashboard residue rather than pervasive slop. The data-specific copy, native controls, cool neutral palette, and evidence caveats feel product-driven. The repeated eyebrow, two-letter logo, equal-weight metric cards, floating panel rhythm, and lack of a clear analytical takeaway make the page feel competent but generic.

**Deterministic scan:** The bundled detector returned zero findings for `apps/web/src/app/page.tsx`. This is a clean markup signal, not proof of design quality. Manual source review found CSS-level issues outside that target: `.coverage` uses a prohibited 3px colored side stripe, `.chart-tooltip` combines a ring with a 30px shadow, and placeholder contrast is too weak.

**Visual overlays:** No reliable user-visible overlay was created. Browser discovery returned no available browser, so mutable injection could not be preflighted. A localhost request confirmed that the rendered route was reachable, but reachability is not visual inspection.

# Overall Impression

The product has a stronger data and trust foundation than its presentation suggests. Its biggest opportunity is to turn the current sequence of filters, metrics, and charts into a guided investigation: make the complete scope visible, state the key market signal in plain language, keep data-quality context next to the claim, and let underlying listings become evidence rather than a premature call to action.

# What’s Working

- The broad-to-specific flow is fundamentally right: filter the market, inspect aggregates and trends, then open the listings underneath.
- Freshness, completeness, sample size, source basis, and per-metric samples are unusually well represented.
- Native semantics, progressive disclosure, responsive table-to-card behavior, focus treatment, reduced motion, and exact chart-data tables form a sound lightweight accessibility baseline.

# Priority Issues

## P1 — Public navigation exposes private operations

**Why it matters:** The desktop public header exposes Admin even though the product contract explicitly excludes crawler operators. It blurs audience boundaries and weakens the feeling of an independent public analysis product.

**Fix:** Keep Analyze and Listings in the public shell. Render crawler navigation only inside the authenticated admin context.

**Suggested command:** `$impeccable polish apps/web/src/app`

## P1 — Filter state is ambiguous and error-prone

**Why it matters:** Exact year can coexist with a year range, active advanced dimensions disappear from the page title, and reset remains hidden inside a disclosure. Users cannot confidently tell which market they are looking at.

**Fix:** Group advanced fields by decision, make exact-year versus year-range behavior explicit, keep Reset visible when filters are active, add bounds, surface the complete applied scope, and give dependent model loading an error/retry state.

**Suggested command:** `$impeccable clarify apps/web/src/app/market-filter-form.tsx`

## P1 — Evidence language can be misinterpreted

**Why it matters:** “Median observed sold price” can sound like a confirmed transaction price, while “crawl” and “Search + detail data” expose implementation language. This directly undermines the product’s trust positioning.

**Fix:** Use public evidence language: observed listing prices are not completed transactions; data is updated through a named date; coverage is complete or partial; the basis is listing and vehicle-detail observations.

**Suggested command:** `$impeccable clarify apps/web/src/app/page.tsx`

## P2 — The interface presents data but not an analytical answer

**Why it matters:** Users must mentally synthesize four metrics and several charts before they know what changed or what deserves attention.

**Fix:** Add a compact, computed market-signal summary for the selected scope and make model year, mileage, and transmission comparisons read as one analytical sequence rather than a dashboard grid.

**Suggested command:** `$impeccable layout apps/web/src/app/page.tsx`

## P2 — Trust context and recovery are visually subordinate

**Why it matters:** Data quality is shown as small metadata with a decorative stripe, while empty and failure states often stop at a short message. A quiet data product needs trust and recovery to be first-class content.

**Fix:** Replace the stripe with a structured coverage panel, keep sample and freshness close to conclusions, and make empty/error states explain the next useful action.

**Suggested command:** `$impeccable harden apps/web/src/app`

# Persona Red Flags

**Alex (power user):** The complete active scope is not visible, cohort comparison requires remembering prior values, and the eleven-control advanced grid slows repeated analysis. The interface supports deep filtering but not fast verification.

**Sam (keyboard, screen-reader, or low-vision user):** Native controls and exact tables are strong, but a failed dependent select is not announced, placeholder contrast is weak, and chart legends rely too heavily on small color marks before users reach the exact-data disclosure.

**Mika (public buyer and enthusiast):** Admin exposure, internal data-pipeline terms, and ambiguous sold-price wording make the product feel less independent and authoritative. The page provides evidence but does not answer the first question: what is typical here, and is it moving?

# Minor Observations

- The brand mark “NA” can read as “not applicable” in a data product.
- Inter is declared but not loaded, so current rendering depends on system fallback metrics.
- The matching-listings action is valuable after the evidence as well as near the page heading.
- The mobile listing-card fallback is a strong existing pattern worth preserving.
- The existing chart tables are useful; they should remain as exact-data alternatives after visual cleanup.

# Questions to Consider

- What is the clearest public phrase for a price last observed on a listing later marked sold, without implying a completed transaction?
- How can one selected market scope feel immediately understandable before adding a more complex side-by-side cohort workflow?

Questions skipped for implementation: `PRODUCT.md`, `DESIGN.md`, and the user’s explicit end-to-end scope already establish the direction—public users only, one selected scope at a time, plain-language qualification, and all major issues in scope.
