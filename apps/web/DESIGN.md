---
version: "alpha"
name: "Nettiauto Analytics"
description: "A calm market-analysis workspace that turns observed vehicle listings into clear, trustworthy comparisons."
colors:
  primary: "#0f766e"
  primary-strong: "#0b5f59"
  primary-soft: "#e8f5f3"
  background: "#f5f6f7"
  surface: "#ffffff"
  ink: "#18201f"
  muted: "#667085"
  soft: "#eef1f2"
  line: "#dfe3e5"
  warning: "#a15c07"
  warning-soft: "#fff5e7"
  danger: "#b42318"
  danger-soft: "#fff0ee"
  chart-sold: "#b45309"
  chart-count: "#334155"
  chart-history-neutral: "#475467"
  chart-grid: "#e5e7eb"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  data-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1
  field-label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 750
    lineHeight: 1.5
    letterSpacing: "0.02em"
  data-label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "0.05em"
rounded:
  focus: "6px"
  control: "7px"
  standard: "8px"
  tooltip: "9px"
  nav: "10px"
  panel: "12px"
  dialog: "14px"
  pill: "999px"
spacing:
  micro: "4px"
  compact: "6px"
  small: "8px"
  control: "10px"
  medium: "12px"
  large: "16px"
  panel: "18px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.standard}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.standard}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "42px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "18px"
  badge-default:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.data-label}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
    height: "25px"
  nav-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "40px"
---

# Design System: Nettiauto Analytics

## Overview

**Creative North Star: "The Market Lens"**

The interface is a calm analytical workspace that brings a broad vehicle market into progressively sharper focus. Filters, charts, coverage signals, and Listings form one continuous investigation: start wide, narrow deliberately, understand the pattern, then inspect the evidence beneath it.

Information density is welcome when it earns its place. The system uses cool neutral surfaces, one restrained teal interaction color, compact type, tabular numerals, and familiar controls so the interface disappears into the task. It rejects marketplace clutter and advertising, intimidating financial-terminal density, decorative SaaS-dashboard styling, and charts that hide uncertainty or demand statistical expertise.

Desktop and mobile are equally real product surfaces. Layout changes structurally at 1120px, 860px, 760px, and 500px: filter and evidence grids regroup, dense tables become cards or scroll safely, and controls remain reachable. Motion is brief state feedback, normally 150ms, with reduced-motion preferences honored globally.

**Key Characteristics:**

- Calm, trustworthy analysis rather than decorative dashboard theater.
- Dense but legible information with clear comparison paths.
- Visible freshness, Sample Size, completeness, and source context.
- Familiar controls and restrained state-driven motion.
- A continuous path from aggregate insight to underlying Listings.

## Colors

The palette is a cool neutral field with one evidence-bearing teal accent and semantic colors reserved for coverage and failure states.

### Primary

- **Evidence Teal** (#0f766e): Primary actions, current selections, asking-price series, and live state indicators.
- **Deep Evidence Teal** (#0b5f59): Hovered actions, strong links, and high-emphasis interactive text.
- **Evidence Wash** (#e8f5f3): Selected or positive state backgrounds that need emphasis without saturation.

### Secondary

- **Coverage Amber** (#a15c07): Incomplete or cautionary coverage states.
- **Coverage Wash** (#fff5e7): Background for warning states and observed-sold qualifications.
- **Observed-Sold Orange** (#b45309): The sold-price chart series, kept distinct from asking-price teal.
- **Failure Red** (#b42318): Errors and destructive operational states only.
- **Failure Wash** (#fff0ee): Error-state backgrounds with readable dark red text.

### Neutral

- **Data Canvas** (#f5f6f7): The page background and lowest visual layer.
- **Working Surface** (#ffffff): Panels, controls, active navigation, and overlays.
- **Market Ink** (#18201f): Primary text and the darkest brand mark.
- **Quiet Slate** (#667085): Supporting text, axes, timestamps, and metadata.
- **Soft Field** (#eef1f2): Secondary neutral layer for grouped controls and low-emphasis areas.
- **Structure Line** (#dfe3e5): Dividers and structural boundaries.
- **Count Slate** (#334155): Listing-count chart series.
- **History Slate** (#475467): Neutral historical chart series.
- **Chart Grid** (#e5e7eb): Low-contrast chart guides that never compete with data.

### Named Rules

**The Evidence Teal Rule.** Evidence Teal identifies action, selection, or meaningful state. It is never ambient decoration and should remain visually scarce.

**The Coverage Is Content Rule.** Warning and danger colors communicate data quality or failure, never visual variety. Every semantic color must be paired with explicit text or structure so meaning never depends on hue alone.

## Typography

**Display Font:** Inter (with ui-sans-serif and the operating-system sans stack)
**Body Font:** Inter (with ui-sans-serif and the operating-system sans stack)
**Label/Mono Font:** The same sans stack with tabular numerals for data

**Character:** One utilitarian sans voice keeps headings, filters, tables, charts, and metadata coherent. Inter is declared but not currently bundled, so the rendered type normally comes from the system fallback; do not assume Inter-specific metrics until the font is explicitly loaded.

### Hierarchy

- **Display** (weight 700, 36px desktop / 30px mobile, line-height 1.08–1.12): Page-level headings only; fixed product scales, balanced wrapping, and restrained tracking keep them legible and predictable.
- **Headline** (weight 700, 18px, line-height 1.3): Section and panel headings.
- **Data Title** (weight 700, 21px, line-height 1.15): Primary metric values with tabular numerals.
- **Body** (weight 400, 15px, line-height 1.5): Explanations, controls, and general content; prose should remain within roughly 65–75 characters per line.
- **Field Label** (weight 750, 12px, letter-spacing 0.02em): Sentence-case field labels and compact metadata.
- **Data Label** (weight 800, 11px, letter-spacing 0.05em): Existing metric and table labels; use sparingly rather than as a universal section-heading device.

### Named Rules

**The One Voice Rule.** Use one sans family across the product. Hierarchy comes from weight, size, spacing, and numeric treatment—not a decorative display face.

**The Numbers Hold Still Rule.** Prices, counts, mileage, timestamps, and axis values always use tabular numerals so comparisons do not jitter.

## Elevation

Depth is quiet and structural. The cool Data Canvas establishes the base layer; white Working Surfaces use a fine ring and shallow ambient shadow to define bounded work areas. Hover adds only a small increase in lift. Deep shadows are reserved for true overlays such as the gallery dialog, never ordinary panels or buttons.

### Shadow Vocabulary

- **Surface Boundary** (`0 0 0 1px rgb(0 0 0 / 6%), 0 1px 2px -1px rgb(0 0 0 / 6%), 0 2px 5px rgb(0 0 0 / 4%)`): Default filter, metric, chart, table, login, and panel separation.
- **Surface Hover** (`0 0 0 1px rgb(0 0 0 / 9%), 0 1px 2px -1px rgb(0 0 0 / 8%), 0 4px 10px rgb(0 0 0 / 6%)`): Interactive secondary surfaces only.
- **Active Navigation** (`0 1px 3px rgb(0 0 0 / 10%)`): The selected item inside the segmented navigation.
- **Dialog Overlay** (`0 24px 80px rgb(0 0 0 / 45%)`): Native dialog overlays against a dark backdrop only.

### Named Rules

**The Structural Lift Rule.** Elevation explains containment or overlay state. If a shadow exists only to make a surface look expensive, remove it.

**The One Boundary Rule.** Do not combine a visible border or ring with a wide decorative drop shadow. Choose the boundary that communicates the state most clearly.

## Components

Components are dense, familiar, and precise. Their visual personality comes from consistent geometry, semantic color, and immediate state feedback rather than novelty.

### Buttons

- **Shape:** Compact rounded rectangle (8px) with a 44px minimum height and 16px horizontal padding.
- **Primary:** Evidence Teal background, white text, a Deep Evidence Teal edge, and 700-weight type.
- **Hover / Focus / Active:** Deep Evidence Teal on hover; a 3px teal focus outline with 2px offset; 150ms state transitions; a restrained 0.96 pressed scale.
- **Secondary:** White Working Surface with Market Ink and the Surface Boundary shadow; hover uses Surface Hover.
- **Disabled:** Neutral fill and text, no pointer action, and no pressed transform.

### Status Badges

- **Style:** True pill geometry (999px), 25px minimum height, 2px by 9px padding, and compact data-label typography.
- **State:** Evidence Wash and Deep Evidence Teal for default/current; Coverage Wash and Coverage Amber for caution; Failure Wash and Failure Red for error; every state retains a text label.

### Cards / Containers

- **Corner Style:** Gently curved working surfaces (12px).
- **Background:** White Working Surface on the Data Canvas.
- **Shadow Strategy:** Surface Boundary at rest; ordinary containers do not float higher.
- **Border:** Dividers use Structure Line; never add colored side stripes as decoration.
- **Internal Padding:** 16px for filter rows, 18–20px for charts and general panels, and 24px only for focused states such as login or page errors. Snapshot values share one bounded strip instead of becoming separate cards.

### Inputs / Fields

- **Style:** White field, 1px neutral stroke, 7px radius, 42px minimum height, and 8px by 10px padding.
- **Focus:** Evidence Teal border plus a 3px translucent teal focus ring.
- **Error / Disabled:** Semantic text must explain failures; disabled fields use a neutral surface and retain legible labels. Placeholder copy must meet body-text contrast expectations.
- **Grouping:** Primary market choices stay visible. Secondary controls are grouped by vehicle range, price and mileage, and observation context; applied scope and Reset stay visible whenever filters are active.

### Navigation

- **Style:** A compact segmented control on a soft neutral track, with 40px targets, 7px active items, and 14px horizontal padding. The active destination uses a white surface, Market Ink, and a shallow shadow; inactive destinations remain readable Quiet Slate.
- **Responsive behavior:** Preserve access to the primary Analyze and Listings destinations on mobile. Administrative navigation appears only inside the admin context and never in the public header.

### Market Snapshot and Coverage

- **Snapshot:** Use one integrated definition-list strip with structural dividers, not a grid of floating KPI cards. Every value carries a nearby sample or interpretation qualifier.
- **Coverage:** Present completeness, freshness, Sample Size, included listing states, and observation basis as structured content with plain-language status. Never use a colored side stripe.
- **Interpretation:** A concise computed market signal may precede a trend chart, but it must state the observed window, latest sample, and a vehicle-mix caveat.

### Data Visualizations

- **Series:** Asking price uses Evidence Teal, prices shown on observed-sold listings use Observed-Sold Orange, and counts or neutral history use slate. Observed-sold values are listing evidence, never described as confirmed transaction prices. Do not encode two concepts with color alone.
- **Context:** Every chart carries a plain-language title, unit, time scope, Sample Size or coverage context where relevant, and an accessible summary or exact-data table when practical.
- **Interaction:** Tooltips reveal precise values without hiding the overall pattern. Legends sit near the data and wrap on narrow screens.
- **Loading / Empty:** Use skeletons for loading and explanatory empty states that help users adjust scope or understand missing evidence.

## Do's and Don'ts

### Do:

- **Do** make the primary comparison or trend understandable before exposing secondary detail.
- **Do** keep freshness, Sample Size, completeness, and data source visible near the result they qualify.
- **Do** use Evidence Teal for action, selection, or asking-price evidence—not decoration.
- **Do** pair color with labels, line styles, position, or table values so charts remain understandable without color perception.
- **Do** preserve the broad-to-specific path from market overview to make, model, segment, and underlying Listings.
- **Do** use semantic HTML, visible focus, adequate touch targets, reduced-motion handling, and chart summaries or data tables as the lightweight accessibility baseline.

### Don't:

- **Don't** introduce marketplace clutter and advertising or turn the product into a marketplace clone.
- **Don't** create intimidating financial-terminal density; progressive detail must keep the first reading approachable.
- **Don't** use decorative SaaS-dashboard styling, gratuitous cards, glass effects, gradient text, or ornamental motion.
- **Don't** hide uncertainty, omit coverage context, or make incomplete observations feel more authoritative than they are.
- **Don't** make statistical expertise a prerequisite for understanding a chart; explain the comparison in plain language.
- **Don't** use colored side-stripe borders greater than 1px on coverage, notices, cards, or callouts.
- **Don't** pair a visible border or ring with a soft shadow wider than 8px on ordinary controls or panels.
- **Don't** repeat tiny uppercase tracked eyebrows above every section or use numbered markers as decorative scaffolding.
- **Don't** introduce new chart colors as one-off literals; assign a named semantic role and keep the same meaning across views.
