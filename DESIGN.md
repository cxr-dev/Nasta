---
name: Nästa
description: Stockholm SL commuter departure dashboard — glanceable PWA
colors:
  neutral-bg: "#FAFAF9"
  surface: "#FFFFFF"
  accent: "#171717"
  text-primary: "#171717"
  text-secondary: "rgba(0,0,0,0.55)"
  text-muted: "rgba(0,0,0,0.35)"
  text-ghost: "rgba(0,0,0,0.13)"
  border-standard: "rgba(0,0,0,0.08)"
  border-subtle: "rgba(0,0,0,0.14)"
  accent-subtle: "rgba(23,23,23,0.10)"
  surface-emphasis: "rgba(0,0,0,0.03)"
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
  sm: "4px"
  md: "8px"
  lg: "14px"
  xl: "20px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
components:
  departure-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
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
    textColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    padding: "1px 6px"
  feature-drawer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "14px 16px"
  warning-banner:
    backgroundColor: "{colors.system-warning-bg}"
    textColor: "{colors.system-warning-text}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  skeleton:
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
- Dynamic color: 16 theme palettes with contrast-aware light/dark adaptation. Not a gray-on-gray default.
- Flat by default: borders draw hierarchy, not shadows. Shadows reserved for floating elements only.

## 2. Colors

The color system is dynamic by design. Sixteen theme palettes (each with two variants) drive the same semantic token set. The default theme below anchors the system; all other palettes supply their own `colorA` (bg) and `colorB` (accent), from which all other tokens are computed via luminance-based contrast logic.

### Default Palette (Neutral Anchor)
- **Neutral Paper** (`#FAFAF9`): Body background. Warm off-white, the lightest surface.
- **White Surface** (`#FFFFFF`): Card, container, and control background.
- **Ink** (`#171717`): Primary text. Also serves as the default accent color.

### Semantic Tokens
- **Accent** (`--accent`): The theme's identifying color. Used for the header rule, page dots, primary CTAs, accent bars on departure cards, countdown numbers, and disruption pill tags.
- **Accent Subtle** (`--accent-subtle`): 15% opacity version of accent. Used for nav arrow backgrounds, action bar backgrounds, icon badge tinting.
- **Text Secondary** (`--text-secondary`): At 65% (dark) / 55% (light) opacity. Secondary labels, stop names, destination text, notice bars.
- **Text Muted** (`--text-muted`): At 40% / 35% opacity. Clock times, disruption type tags, freshness labels, attribution footer.
- **Text Ghost** (`--text-ghost`): At 18% / 13% opacity. Empty state illustrations, disabled indicators, page dots resting state.
- **Border Standard** (`--border`): At 12% / 8% opacity. Card outlines, notice bar outlines, section dividers.
- **Border Subtle** (`--border-subtle`): At 20% / 14% opacity. Scrollbar tracks, less prominent dividers.
- **Surface Emphasis** (`--surface-emphasis`): Slightly darker (light mode) or lighter (dark mode) than surface. Subtle container differentiation.

### Named Rules
**The Dynamic Contrast Rule.** All text, surface, and border tokens are computed from the background color's luminance — never hardcoded per theme. A dark background produces light text at fixed opacity ratios; a light background produces dark text. This guarantees WCAG 2.1 AA contrast without manual tuning per palette.

### System States
- **Freshness Green** (`#27ae60`): Data is recent.
- **Warning Amber** (`#FEF3C7` bg, `#FCD34D` border, `#92400E` text): Stop lookup warnings.
- **Error Red** (`#fef2f2` bg, `#fecaca` border, `#991b1b` text): Fetch errors.
- **Disruption Critical** (`#e74c3c`): Critical delays or cancellations.
- **Disruption Affected** (`#e8950a`): Moderate disruptions.

## 3. Typography

**Display Font:** Neue Machina (700, 800, 900 weights)
**Body Font:** Satoshi (400, 500, 600, 700 weights)
**Fallback:** DM Sans, -apple-system, BlinkMacSystemFont, sans-serif

**Character:** A high-contrast pairing purpose-built for glanceability. Neue Machina's condensed, squared letterforms pack maximum weight into minimum width — ideal for countdown numbers and page titles that must read instantly. Satoshi provides calm, wide-proportion body text that never competes with the display face. The pairing is geometric + geometric, differentiated by weight and proportion rather than species.

### Hierarchy
- **Display** (800 weight, `clamp(38px, 10vw, 52px)`, 0.9 line-height, `-0.035em` letter-spacing): Page route names. Caps the headline space. `text-wrap: balance`.
- **Countdown** (900 weight, 34px, 1 line-height, `-1.5px` letter-spacing, tabular-nums): The departure minutes. Always the largest numeric element on screen. Uses `font-variant-numeric: tabular-nums` for stable width as digits change.
- **Headline** (700 weight, 22px, 1.1 line-height, `-0.02em` letter-spacing): Empty-state headings and section headers. `text-wrap: balance`.
- **Route Number** (900 weight, 19px, 1.2 line-height): Bus/train line identifier in departure cards.
- **Body** (400 weight, 15px, 1.4 line-height, `text-wrap: pretty`): Descriptions, empty-state copy, station notices. Cap body width at 240px where constrained (empty states).
- **Label** (600 weight, 12px, 1.3 line-height): Metadata labels, secondary info.
- **Small** (500 weight, 11px, 1 line-height, tabular-nums): Clock times, freshness indicators, disruption pills (uppercase, 9px, 700 weight, 0.04em letter-spacing).
- **Caption** (400 weight, 10px, uppercase, 0.09em letter-spacing): Section labels for disrupted segments grouping.

### Named Rules
**The Dominant Countdown Rule.** The departure countdown (34px, 900 weight, Neue Machina) must be the largest number on any card. No competing numeric display within the same card. If a secondary time is needed, it appears at 11px below the countdown, not beside it.

## 4. Elevation

Nästa uses a **flat-by-default** elevation model. Depth is conveyed through tonal contrast (`--surface` on `--bg`) and border strokes, not shadows. Shadows exist in exactly two places:

### When Shadows Are Used
- **Floating Action Bar** (`0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)`): The sticky bottom button must visually separate from scrollable content. Two-layer shadow: a wide ambient spread (24px, 10%) and a tight directional shadow (4px, 6%) for edge crispness.
- **Feature Discovery Drawer** (`0 24px 60px rgba(0,0,0,0.22)`): Modal panel that overlays content. The strongest shadow in the system — intentionally heavy to communicate modal separation.
- **Onboarding CTA Pulse** (`0 0 0 12px ...`): Animating ring during first-run onboarding (GSAP-driven).

### Named Rules
**The Flat-By-Default Rule.** Every surface is flat at rest. Card separation comes from a 1px `--border` stroke, not a drop shadow. The presence of a shadow is always a deliberate signal: "this element floats above the content stack."

## 5. Components

### Buttons

#### Primary CTA
- **Shape:** Gently rounded (8px). Solid background.
- **Default:** `--accent` background, `--text-on-accent` color. 14px 24px padding. 15px, 600 weight.
- **Hover:** `translateY(-1px)` lift; slight shadow intensification.
- **Active:** `scale(0.965)`, opacity 0.9 (global button reset: `transition 120ms ease`).
- **Disabled:** 50% opacity, `not-allowed` cursor.

#### Action Bar Button
- **Shape:** More rounded (16px). Translucent via `backdrop-filter: blur(12px)`.
- **Default:** `--accent-subtle` background, 1px `--border` stroke, `--accent` text. 14px 20px padding. Max-width 320px, centered.
- **Edit Mode:** Fills to `--accent` bg with `--bg` text.
- **Shadow:** 0 4px 24px + 0 1px 4px (floating element).

#### Icon Buttons
- **Nav arrows:** 36px circle, `--accent-subtle` bg, center-aligned 14px icon.
- **Header icon:** 44px circle, transparent bg. Hover: `--accent-subtle` bg.
- **Active:** `scale(0.92)` to `scale(0.965)`.

### Departure Cards
- **Corner Style:** 14px rounded.
- **Background:** `--surface`. 1px `--border` stroke.
- **Layout:** Horizontal flex: accent bar (4px left rail) → icon badge (32px, 8px radius) → meta column (route number, stop, destination) → time column (countdown, clock times). Right-aligned time is the focal point.
- **Accent Bar:** 4px wide, `--accent` color. Rounded right side only (0 2px 2px 0). Pulses when imminent (1.2s glow animation) or soon (2s).
- **States:**
  - Default: `--accent` bar, standard text.
  - Affected: `--accent` replaced by `#e8950a` on bar + countdown.
  - Critical: `--accent` replaced by `#e74c3c` on bar + countdown. Card bg tinted `rgba(231, 76, 60, 0.06)`.
  - Expanded: Border shifts to `--accent-subtle`. Disruption strip appears below with color-mixed border and tinted bg.
- **Inner Padding:** 10px 14px for main row. Expanded panel: 0 14px 14px.

### Notice Bars
- **Corner Style:** 10px rounded.
- **Background:** `--surface`. 1px `--border` stroke. Chevron flips on expand.
- **Label:** 12px, 600 weight, `--text-secondary`.
- **Count Badge:** `--accent` bg, `--text-on-accent` text, pill shape, 11px.
- **Inner Padding:** 9px 12px collapsed. 10px 12px 12px expanded.

### Disruption Elements
- **Strip:** `border-top` with color-mix (20% strip-color, rest border). Background tinted at 8% opacity of strip color.
- **Icon:** 14px, strip-color.
- **Message:** 12px, strip-color, single-line with ellipsis.
- **Pill:** 10px radius, strip-color bg, uppercase 9px 700 weight, 0.04em letter-spacing, 2px 7px padding.

### Page Dots
- 6px circles, `--text-ghost` bg. Active dot: `--text` color, `scale(1.3)`. Gap: 6px.

### Skeleton / Loading
- **Style:** Shimmer gradient (`--surface` → `--border` → `--surface`) at 200% width, animated via GSAP at 1.5s `sine.inOut`, repeating.
- **Card Shape:** 14px radius, 1px border, matching departure card silhouette. Top accent bar (4px, `--accent-subtle`).

### Feature Discovery Drawer
- **Shape:** 20px rounded, 1px `--border` stroke.
- **Shadow:** `0 24px 60px rgba(0,0,0,0.22)` — heaviest in system.
- **Position:** Fixed at bottom, centered at 456px max-width, 72dvh max-height.
- **Backdrop:** Fixed fullscreen, `rgba(0,0,0,0.38)` with 2px `backdrop-filter: blur`.

### Error & Warning Banners
- **Shape:** 8px rounded. 10px 12px padding.
- **Warning:** `#FEF3C7` bg, `#FCD34D` border, `#92400E` text.
- **Error:** `#fef2f2` bg, `#fecaca` border, `#991b1b` text.
- Dismiss button: inherit text color, 18px.

## 6. Do's and Don'ts

### Do:
- **Do** use the departure countdown (34px, 900 weight) as the dominant visual element on each card.
- **Do** let the dynamic theme system determine accent and text colors — never hardcode a color value for a themed surface.
- **Do** keep the interface at 480px max-width, single-column, with the main scroll area as the primary interaction.
- **Do** use border strokes (1px `--border`) for card separation; surfaces rest flat.
- **Do** animate with GSAP using `power2.out` / `power3.out` easing; use `back.out(1.7)` only for spring entrances of modals and first-run elements.
- **Do** respect `prefers-reduced-motion`: collapse all animations to instant state changes.
- **Do** show a freshness indicator (dot + label) so the user always knows data recency.

### Don't:
- **Don't** use gradient text (`background-clip: text` + gradient). Single solid color only.
- **Don't** use side-stripe borders (colored `border-left` / `border-right` greater than 1px as decoration).
- **Don't** use glassmorphism (`backdrop-filter: blur` + semi-transparent bg) except on the defined floating action bar, modal backdrop, and MapViewer close button. Never on cards or panels.
- **Don't** pair `border: 1px solid` with `box-shadow` blur ≥ 16px on the same element. Pick one: a solid border at `--border`, OR a shadow (action bar uses shadow; cards use border).
- **Don't** use card radii larger than 14px for departure cards. The 20px radius is reserved for the feature drawer; 16px for the action bar button.
- **Don't** apply borders to cards that have a disruption strip. Disrupted cards use a transparent border to avoid double-stroke with the strip.
- **Don't** hardcode amber/red warning banner colors outside the system palette; use the defined token set for consistency.
- **Don't** create numbered section markers (01 / 02 / 03) or uppercase tracked kickers above sections. Sequences earn their numbering.
- **Don't** gate content visibility behind class-triggered transitions that could pause in hidden tabs or headless renderers.
- **Don't** let the default warm off-white bg shift into cream/sand/beige territory; `#FAFAF9` is intentionally restrained.
