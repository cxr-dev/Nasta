# Deferred Issues

Tracked during theme engine overhaul (PR 1). These are known, named bugs/design seams
that were deliberately deferred — not silently dropped.

## 1. getDarkVariant returns wrong variant for all-light themes

**File:** `src/stores/settingsStore.svelte.ts:13,18`
**Function:** `getDarkVariant()` (src/themes.ts:505)

### Bug
`getDarkVariant()` always returns 'A' or 'B', even when both variants have OKLCH L ≥ 0.5
(neither is dark). Affects 3 themes:

| Theme | colorA (L) | colorB (L) |
|---|---|---|
| electric-pulse | #635BFF (0.578) | #00E5E5 (0.835) |
| solar-violet | #706FD3 (0.590) | #F7F1E3 (0.959) |
| lavender-haze | #6260FF (0.586) | #E4E4FF (0.927) |

### Impact
- Visual result is fine: `applyTheme` uses `needsLightText(bg)` independently → correct styling
- **Label is wrong**: `getVariantName` shows no "Dark" suffix because both variants have
  `isLight: true`, so user toggles dark mode but variant name doesn't change

### Design decision needed
What should "dark mode" mean for all-light themes?
- A: Force-generate a darker variant
- B: Relabel ("Dark" suffix for lower-L variant)
- C: Disable dark mode toggle for all-light themes
- D: Accept as-is (cosmetic label issue only)

### Discovered during
Theme engine overhaul — OKLCH L < 0.5 threshold made the classification visible.
Bug is pre-existing (predates overhaul).

---

## 2. Cross-function surface collision — architectural seam

**Files:** `src/themes.ts` — `deriveSurfaceColor` (line 355), `deriveSurfaceEmphasis` (line 367),
`computeSurfaces` (line 319)

### Issue
Two different design philosophies for surface tokens:
- `deriveSurfaceColor` / `deriveSurfaceEmphasis` use **fixed absolute L targets** (0.94 / 0.88)
  for consistent perceptual appearance across themes
- `computeSurfaces` uses **bg-relative offsets** (bgL + 0.02 / 0.04 / 0.06) for interaction
  states that must scale with background

When a light bg's offset lands near a fixed target, adjacent tokens collide:

| Theme | Collision | Gap | Root cause |
|---|---|---|---|
| iron-lemon[A] | surface (0.941) ≈ hover (0.940) | 0.0007 | bgL+0.04 ≈ 0.94 |
| sulu-forest[A] | emphasis (0.880) ≈ pressed (0.878) | 0.0027 | bgL+0.02 ≈ 0.88 |

Both produce visually distinct hex colors (#eeecde vs #ffef6a, #d2dbcc vs #adec88).

### Impact
- 2 collisions out of 220 surface tokens (44 themes × 5 tokens) = 0.9%
- No visual impact (hex colors differ even when L values are close)
- This is an **architectural seam**, not a bug — the two systems serve different purposes

### Fix requires design decision
Migrate `deriveSurface*` to bg-relative system? Pro: eliminates seam.
Con: changes visual appearance of every light theme's base surface. Needs deliberate design
evaluation, not a quick patch.

### Discovered during
Phase 1 scope: "add semantic accent/surface/shadow tokens" — computeSurfaces was new,
deriveSurface* was pre-existing. The seam was left intentionally, not silently dropped.
