---
name: Nästa
description: Stockholm SL commuter departure dashboard — glanceable PWA
colors:
  neutral-bg: "#FAFAF9"
  surface: "#FFFFFF"
  accent: "#171717"
  text: "#171717"
  text-secondary: "rgba(0,0,0,0.55)"
  text-muted: "rgba(0,0,0,0.35)"
  text-ghost: "rgba(0,0,0,0.13)"
  border-standard: "rgba(0,0,0,0.08)"
  border-subtle: "rgba(0,0,0,0.14)"
  accent-subtle: "rgba(23,23,23,0.10)"
  surface-emphasis: "rgba(0,0,0,0.03)"
  page-work: "#2563EB"
  page-home: "#059669"
  system-warning-bg: "#FEF3C7"
  system-warning-border: "#FCD34D"
  system-warning-text: "#92400E"
  system-error-bg: "#fef2f2"
  system-error-border: "#fecaca"
  system-error-text: "#991b1b"
  disruption-critical: "#e74c3c"
  disruption-affected: "#e8950a"
  freshness-green: "#27ae60"
typography:
  display:
    fontFamily: "'Neue Machina', sans-serif"
    fontSize: "clamp(38px, 10vw, 52px)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Neue Machina', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  countdown:
    fontFamily: "'Neue Machina', sans-serif"
    fontSize: "34px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-1.5px"
  body:
    fontFamily: "'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'Satoshi', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
z-index:
  sticky: 100
  overlay: 300
  dialog: 400
  toast: 500
components:
  departure-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "14px 24px"
  button-action-bar:
    backgroundColor: "{colors.accent-subtle}"
    textColor: "{colors.accent}"
    rounded: "16px"
    padding: "14px 20px"
  notice-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.lg}"
    padding: "9px 12px"
  nav-arrow:
    backgroundColor: "{colors.accent-subtle}"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
  page-dot:
    backgroundColor: "{colors.text-ghost}"
    rounded: "{rounded.full}"
  badge-pill:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    padding: "1px 6px"
  feature-drawer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  warning-banner:
    backgroundColor: "{colors.system-warning-bg}"
    textColor: "{colors.system-warning-text}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  skeleton:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
  icon-button:
    backgroundColor: "none"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    size: "36px"
  page-header-icon:
    backgroundColor: "{colors.accent-subtle}"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    size: "36px"
  settings-drawer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  onboarding:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  disruption-pill:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
  segment-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: Nästa

## 1. Overview

**Creative North Star: "The Departure Board"**

Nästa is a real-time Stockholm transit dashboard designed for a single purpose: telling the commuter when the next departure leaves, in under a second, at a glance. It takes the visual language of physical departure boards at transit stations — bold, typographic, high-contrast, no decoration — and brings it to a mobile screen.

The system is opinionatedly flat: no gradient text, no glassmorphism, no numbered section markers, no decorative flourishes. Surfaces separate by borders and tonal contrast, not by shadows. The interface at 480px max-width is always a single column, one-handed, designed for outdoor sunlight readability and tunnel-region offline resilience.

**Key Characteristics:**
- No gradient text. No side-stripe borders. No glassmorphism.
- Mobile-first: 480px max-width, single-column, one-handed thumb zone.
- Bold display typography: the countdown number (34px 900 weight) is always the largest element on screen.
- Handcrafted color: one restrained identity with light, dark, and system preferences. Status colors are purposeful and calm.
- Flat by default: borders draw hierarchy, not shadows. Shadows reserved for floating elements only.

## 2. Colors

The color system is intentionally small. Two hand-authored palettes drive one semantic token set; System resolves to the operating system's light or dark preference. Production colors are static and are validated with WCAG tests rather than generated at runtime.

### Handcrafted palettes
- **Light** (`#F7F7F5`): Restrained neutral background with white surfaces and ink text.
- **Dark** (`#111211`): Soft near-black background with subtly lifted neutral surfaces and near-white text.

### Semantic Tokens
- **`--bg`**: Root background for the resolved Light or Dark palette.
- **`--surface`**: The primary near-white or lifted near-black content surface.
- **`--surface-emphasis`**: A stronger tonal step for selected and emphasized containers.
- **`--accent`**: The theme's identifying color. Used for the header rule, page dots, primary CTAs, accent bars on departure cards, countdown numbers, and disruption pill tags.
- **`--accent-subtle`**: 15% opacity version of accent. Used for nav arrow backgrounds, action bar backgrounds, icon badge tinting.
- **`--text`**: Hand-authored primary text color, verified at 4.5:1 or better against its rendering surface.
- **`--text-on-accent`**: Contrast-optimized for the accent background (page dots active, badge pills).
- **`--text-secondary`**: Hand-authored secondary text for stop names, destinations, and notices.
- **`--text-muted`**: Hand-authored low-emphasis text for clock times, labels, and freshness indicators.
- **`--text-ghost`**: Hand-authored quiet text for disabled indicators and resting states.
- **`--border`**: Visible tonal separation for cards, notices, and section dividers.
- **`--border-strong`**: Stronger separation for focused or emphasized boundaries.
- **`--page-work`** (`#2563EB`): Work route indicator.
- **`--page-home`** (`#059669`): Home route indicator.

### The Contrast Rule
Text, surface, status, and border tokens are authored separately for Light and Dark and verified with WCAG contrast tests. No production token is generated at runtime.

### Status Colors (Handcrafted)
Status colors are static semantic tokens, tuned separately for Light and Dark. Normal departures remain neutral; only delayed, cancelled, and informational states receive color:
- **On time**: neutral ink/accent; no green countdown.
- **Delayed**: muted ochre/amber with a restrained tinted background.
- **Cancelled**: muted brick red with a restrained tinted background.
- **Information**: desaturated blue for supporting information.

### Static System States
- **On time**: Neutral ink/accent; normality does not need a success color.
- **Delayed**: Muted ochre/amber, applied only to affected metadata or labels.
- **Cancelled**: Muted brick red with a stronger text label and subdued tint.
- **Information**: Desaturated blue for supporting notices.

### Named Rules
**The Static Token Rule.** Every production token belongs to the small Light/Dark palette tables and has a concrete use in the app.

## 3. Typography

**Display Font:** Neue Machina (700, 800, 900 weights)
**Body Font:** Satoshi (400, 500, 600, 700 weights)
**Fallback:** DM Sans, -apple-system, BlinkMacSystemFont, sans-serif

**Character:** A high-contrast pairing purpose-built for glanceability. Neue Machina's condensed, squared letterforms pack maximum weight into minimum width — ideal for countdown numbers and page titles that must read instantly. Satoshi provides calm, wide-proportion body text that never competes with the display face. The pairing is geometric + geometric, differentiated by weight and proportion rather than species.

### Hierarchy
- **Display** (800 weight, `clamp(38px, 10vw, 52px)`, 0.9 line-height, `-0.035em` letter-spacing): Page route names. Caps the headline space. `text-wrap: balance`. Color: `--accent`.
- **Countdown** (900 weight, 34px, 1 line-height, `-1.5px` letter-spacing, tabular-nums): The departure minutes. Always the largest numeric element on screen. Uses `font-variant-numeric: tabular-nums` for stable width as digits change. Color: neutral text by default, with muted delayed or cancelled color only when the departure is affected.
- **Headline** (700 weight, 22px, 1.1 line-height, `-0.02em` letter-spacing): Empty-state headings and section headers. `text-wrap: balance`.
- **Route Number** (900 weight, 19px, 1.2 line-height): Bus/train line identifier in departure cards.
- **Body** (400 weight, 15px, 1.4 line-height, `text-wrap: pretty`): Descriptions, empty-state copy, station notices. Cap body width at 240px where constrained (empty states).
- **Label** (600 weight, 12px, 1.3 line-height): Metadata labels, secondary info.
- **Small** (500 weight, 11px, 1 line-height, tabular-nums): Clock times, freshness indicators. Swipe hint text.
- **Caption** (400 weight, 10px, uppercase, 0.09em letter-spacing): Section labels for disrupted segments grouping.
- **Disruption Pill** (700 weight, 9px, uppercase, 0.04em letter-spacing): Disruption type tags. 2px 7px padding.

### Named Rules
**The Dominant Countdown Rule.** The departure countdown (34px, 900 weight, Neue Machina) must be the largest number on any card. No competing numeric display within the same card. If a secondary time is needed, it appears at 11px below the countdown, not beside it.

## 4. Elevation & Z-Index

Nästa uses a **flat-by-default** elevation model. Depth is conveyed through tonal contrast (`--surface` on `--bg`) and border strokes, not shadows. Shadows exist in exactly two places:

### Z-Index Scale
```
--z-sticky:  100   — Section headers, pull-to-refresh indicator
--z-overlay: 300   — Map preview backdrop, quick-add drawer backdrop
--z-dialog:  400   — Settings panel, page editor, onboarding, feature discovery drawer
--z-toast:   500   — Error boundary toast, update banner, page editor toast
```

### When Shadows Are Used
- **Floating Action Bar** (`0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)`): The sticky bottom button must visually separate from scrollable content. Two-layer shadow: a wide ambient spread (24px, 10%) and a tight directional shadow (4px, 6%) for edge crispness.
- **Feature Discovery Drawer** (`0 24px 60px rgba(0,0,0,0.22)`): Modal panel that overlays content. The strongest shadow in the system — intentionally heavy to communicate modal separation. `--z-dialog`.
- **Onboarding CTA Pulse** (`0 0 0 12px ...`): Animating ring during first-run onboarding (GSAP-driven).
- **Quick-Add Drawer**: Top corners rounded (`--radius-lg`). Backdrop at `--z-overlay`.

### Surface Separation Rules
- **Desktop buttons**: Icon buttons get a `1px solid var(--border)` stroke and `box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset` at ≥768px. Not shadows — these are inset highlights.
- **Cards**: 1px `--border` stroke, no shadow.

### Named Rules
**The Flat-By-Default Rule.** Every surface is flat at rest. Card separation comes from a 1px `--border` stroke, not a drop shadow. The presence of a shadow is always a deliberate signal: "this element floats above the content stack."

## 5. Components

### Buttons

#### Primary CTA
- **Shape:** Gently rounded (12px). Solid background.
- **Default:** `--accent` background, `--text-on-accent` color. 14px 24px padding. 15px, 600 weight.
- **Hover:** `translateY(-1px)` lift; slight shadow intensification.
- **Active:** `scale(0.965)`, opacity 0.9 (global button reset: `transition 120ms ease`).
- **Disabled:** 50% opacity, `not-allowed` cursor.

#### Action Bar Button
- **Shape:** More rounded (16px). Translucent via `backdrop-filter: blur(12px)`.
- **Default:** `--accent-subtle` background, 1px `--border` stroke, `--accent` text. 14px 20px padding. Max-width 320px, centered.
- **Edit Mode:** Fills to `--accent` bg with `--bg` text.
- **Shadow:** `0 4px 24px` + `0 1px 4px` (floating element).

#### Icon Buttons
- **Mobile (default):** 36px square, `border-radius: 8px`, transparent bg. Hover: `--border` bg.
- **Desktop (≥768px):** 40px square, `border-radius: 8px`, `1px solid var(--border)` stroke, `--surface` bg, `0 1px 0 rgba(255,255,255,0.5) inset` highlight. Hover: `--accent-subtle` bg.
- **Color:** `--text`.
- **Active:** `scale(0.965)`.

#### Nav Arrows (PageHeader)
- **Shape:** 36px circle, `--accent-subtle` bg, center-aligned 14px icon.
- **Color:** `--accent`.
- **Disabled:** Opacity 0.25, `cursor: default`.
- **Active:** `scale(0.92)`.
- **Nudge animation:** When reaching boundary, bounces -4px (prev) / +4px (next) in 120ms yoyo.

### Departure Cards
- **Corner Style:** 12px rounded (`--radius-md`).
- **Background:** `--surface`. 1px `--border` stroke.
- **Layout:** Horizontal flex: accent bar (4px left rail) → icon badge (32px, 8px radius) → meta column (route number, stop, destination) → time column (countdown, clock times). Right-aligned time is the focal point.
- **Accent Bar:** 4px wide, `--accent` color. Rounded right side only (0 2px 2px 0). Pulses when imminent (1.2s glow animation) or soon (2s).
- **States:**
  - Default: `--accent` bar, standard text.
  - Affected: `--accent` replaced by `#e8950a` on bar + countdown.
  - Critical: `--accent` replaced by `#e74c3c` on bar + countdown. Card bg tinted `rgba(231, 76, 60, 0.06)`.
  - Expanded: Border shifts to `--accent-subtle`. Disruption strip appears below with color-mixed border and tinted bg.
- **Inner Padding:** 10px 14px for main row. Expanded panel: 0 14px 14px.

### Transport Icon
- **Size:** 32px × 32px. `border-radius: 8px` (`--radius-sm`).
- **Background:** `--accent` (default) or `--accent-subtle`. Icon fill: `--text-on-accent` or `--accent`.
- **Sizing:** 20px icon centered within 32px box.

### Notice Bars (StationNoticeBar)
- **Corner Style:** 10px rounded.
- **Background:** `--surface`. 1px `--border` stroke. Chevron flips on expand.
- **Label:** 12px, 600 weight, `--text-secondary`.
- **Count Badge:** `--accent` bg, `--text-on-accent` text, pill shape, 11px.
- **Inner Padding:** 9px 12px collapsed. 10px 12px 12px expanded.

### Disruption Elements
- **DisruptionList:** Renders per-segment deviations in expanded departure card.
  - **Message:** 14px, `--text`, 1.5 line-height.
- **Strip:** `border-top` with color-mix (20% strip-color, rest border). Background tinted at 8% opacity of strip color.
- **Icon:** 14px, strip-color.
- **Pill:** 10px radius, strip-color bg, uppercase 9px 700 weight, 0.04em letter-spacing, 2px 7px padding. Color: `--text`.
- **Critical pill bg:** `--color-critical`. Affected pill bg: `--color-warning`.

### Page Dots
- 6px circles, `--text-ghost` bg. Active dot: `--text` color, `scale(1.3)`. Gap: 6px.

### Skeleton / Loading
- **Style:** Shimmer gradient (`--surface` → `--border` → `--surface`) at 200% width, animated via GSAP at 1.5s `sine.inOut`, repeating.
- **Shape:** Configurable `border-radius` (default 8px), matching departure card silhouette.
- **Accessibility:** `prefers-reduced-motion` collapses to static 0.4 opacity.
- **No accent bar** — plain geometry only.

### PageHeader
- **Layout:** 14px 20px 0 padding (top includes `env(safe-area-inset-top)`). `--bg` background.
- **Title:** `--accent` color. Display font spec (clamp 38px-52px, 800 weight, -0.035em). Centered, flex: 1.
- **Nav arrows:** 36px circles flanking the title. `--accent-subtle` bg, `--accent` color.
- **Swipe hint:** 11px, 500 weight, `--text-secondary`, centered below title. Only when `hasSwipedRoutes` is false and ≥2 pages.
- **Header rule:** 2px tall, `--accent` at 0.25 opacity, bleeds -20px margin. Sits below title block.

### SegmentDepartures
- **Wrapper** for all departures of a page segment. Renders a list of `DepartureRow` cards.
- **Section label (Caption):** 10px, uppercase, 0.09em letter-spacing, `--text-muted`.
- **Spacing:** 14px gap between sections.

### SegmentList
- **Grouped segment display** with collapse/expand behavior.
- **Cards:** `--radius-md` (12px), `--surface` bg, `--border` stroke.
- **Segment direction label:** 12px, 600 weight, `--text`.
- **Collapsed:** Shows direction + pin icon. Expanded: shows full departure list.

### SegmentSearch
- **Modal-style overlay** for adding new route segments. `--z-dialog`.
- **Background:** `--surface`. `--radius-lg` top corners when drawer-style.
- **Input field:** 15px, `--text`. Placeholder: 400 weight, `--text-muted`.
- **Search results:** `--radius-sm` (8px) cards with `--border` stroke.
- **Recent routes section:** 12px label, `--text-secondary`.

### DirectionSelector
- **Row of direction chips** for choosing inbound/outbound.
- **Active chip:** `--accent` bg, `--text-on-accent` text, pill shape.
- **Inactive chip:** `--surface` bg, `--border` stroke, `--text` text, pill shape.

### Feature Discovery Drawer
- **Shape:** 14px rounded (`--radius-lg`), 1px `--border` stroke.
- **Shadow:** `0 24px 60px rgba(0,0,0,0.22)` — heaviest in system.
- **Position:** Fixed at bottom, centered at 456px max-width, 72dvh max-height.
- **Backdrop:** Fixed fullscreen, `rgba(0,0,0,0.38)` with 2px `backdrop-filter: blur`.
- **Z-index:** `--z-dialog`.
- **Icons within:** 48px circles, `--radius-full`, `--accent-subtle` bg, `--accent` color.

### Map Preview / Map Viewer
- **MapPreview:** Tappable preview thumbnail showing stop location via maplibre-gl (dynamically imported, code-split).
- **MapViewer:** Full-screen expanded map. `--z-overlay`. Close button: `backdrop-filter: blur(12px)` semi-transparent.
- **Not a primary UI element** — invoked on demand from stop detail.

### Onboarding
- **Full-screen first-run experience.** `--z-dialog`.
- **Step container:** `--surface` bg, `--radius-lg`, centered at 456px max-width.
- **Progress dots:** Page dot spec. Active: `--accent`.
- **CTA button:** Primary CTA spec. Pulses on first step via GSAP ring animation (`0 0 0 12px ...`).
- **Skip link:** 12px, `--text-secondary`, top-right.

### Update Banner (UpdateBanner)
- **Toast-style banner** for service worker updates. `--z-toast`.
- **Shape:** `--radius-md` (12px). `--accent` bg, `--text-on-accent` text.
- **Content:** 15px message + dismiss button. 10px 12px padding.
- **Action button:** Pill shape, transparent bg with white border, 12px.

### Error Boundary (ErrorBoundary)
- **Toast-style error banner.** `--z-toast`.
- **Shape:** `--radius-sm` (8px). `--color-error-bg` bg, `--color-error` text.
- **Dismissible.** 12px message.

### Settings Panel (SettingsPanel)
- **Responsive sheet** with `--z-dialog`: full-height and touch-oriented on mobile, centered modal on larger screens.
- **Shape:** `--radius-lg` top corners. `--surface` bg.
- **Layout:** Single-column list. Row: icon + label + control. Divider: `--border`.
- **Typography:** Row label 15px, `--text`. Row description 12px, `--text-secondary`.
- **Theme picker:** Three accessible choices: System, Light, and Dark, each with a compact departure-row preview.
- **Close:** `SurfaceControl` close control with an accessible label.

### Page Editor (PageEditor)
- **Full-screen overlay** for managing route pages. `--z-dialog`.
- **Edit mode** transforms action bar to filled accent state.
- **Bottom toast:** `--z-toast`, `--radius-sm`, `--color-success` bg on save.
- **Row actions:** Delete icon (trash), reorder handle.

### Error & Warning Banners
- **Shape:** 8px rounded. 10px 12px padding.
- **Warning:** `#FEF3C7` bg, `#FCD34D` border, `#92400E` text.
- **Error:** `#fef2f2` bg, `#fecaca` border, `#991b1b` text.
- Dismiss button: inherit text color, 18px.

## 6. Do's and Don'ts

### Do:
- **Do** use the departure countdown (34px, 900 weight) as the dominant visual element on each card.
- **Do** use the hand-authored semantic Light/Dark tokens and validate their contrast in tests.
- **Do** keep the interface at 480px max-width, single-column, with the main scroll area as the primary interaction.
- **Do** use border strokes (1px `--border`) for card separation; surfaces rest flat.
- **Do** animate with GSAP using `power2.out` / `power3.out` easing; use `back.out(1.7)` only for spring entrances of modals and first-run elements.
- **Do** respect `prefers-reduced-motion`: collapse all animations to instant state changes.
- **Do** show a freshness indicator (dot + label) so the user always knows data recency.
- **Do** use `--z-*` scale for stacking; never use arbitrary z-index values.
- **Do** use static semantic status tokens for calm delayed, cancelled, and information states.

### Don't:
- **Don't** use gradient text (`background-clip: text` + gradient). Single solid color only.
- **Don't** use side-stripe borders (colored `border-left` / `border-right` greater than 1px as decoration).
- **Don't** use glassmorphism (`backdrop-filter: blur` + semi-transparent bg) except on the defined floating action bar, modal backdrop, and MapViewer close button. Never on cards or panels.
- **Don't** pair `border: 1px solid` with `box-shadow` blur ≥ 16px on the same element. Pick one: a solid border at `--border`, OR a shadow (action bar uses shadow; cards use border).
- **Don't** use card radii larger than 14px (`--radius-lg`) for departure cards. The 14px radius is reserved for the feature drawer and onboarding; the quick-add drawer uses `--radius-lg` for top corners only.
- **Don't** apply borders to cards that have a disruption strip. Disrupted cards use a transparent border to avoid double-stroke with the strip.
- **Don't** hardcode amber/red warning banner colors outside the system palette; use the defined token set for consistency.
- **Don't** create numbered section markers (01 / 02 / 03) or uppercase tracked kickers above sections. Sequences earn their numbering.
- **Don't** gate content visibility behind class-triggered transitions that could pause in hidden tabs or headless renderers.
- **Don't** let the default warm off-white bg shift into cream/sand/beige territory; `#FAFAF9` is intentionally restrained.
- **Don't** hardcode `--text-primary` — the token is `--text` (confirmed by CSS variable test).
- **Don't** use `--radius-xl` (20px); the system's largest radius is `--radius-lg` (14px) and `--radius-full` (999px).
