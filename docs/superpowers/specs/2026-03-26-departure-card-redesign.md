# Departure Card Redesign Specification

**Date:** 2026-03-26  
**Status:** Approved  

## Overview

Redesign the departure card in `SegmentDepartures.svelte` to improve visual hierarchy and eliminate redundant information.

## Changes

### 1. Remove Duplicate Destination
- Remove destination text from departure header (`dep-header`)
- Destination already visible in segment title above
- Keep transport icon and line number for context

### 2. Fix Transport Type Icon
- Use segment's `transportType` field (not departure's)
- Ensures icon matches what user selected, not what API returns
- Icon mapping:
  - `bus` → 🚌
  - `train` → 🚆
  - `metro` → 🚇
  - `boat` → 🚢

### 3. Visual Hierarchy for Departure Times

**Structure:**
```
[Transport Icon] [Line]
[Next Minutes] (Next Time)     [Second Minutes] (Second Time)
```

**Typography:**
| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Next minutes | 48px | 700 | var(--text) |
| "MIN" label (next) | 14px | 500 | var(--text-secondary) |
| Next time | 12px | 400 | var(--text-secondary) |
| Second minutes | 24px | 500 | var(--text) |
| "MIN" label (second) | 12px | 400 | var(--text-secondary) |
| Second time | 12px | 400 | var(--text-secondary) |

**Layout:**
- Next departure: prominent, left-aligned
- Second departure: smaller, right-aligned, more subtle
- Exact times in parentheses, muted color

## Files to Modify

- `src/components/SegmentDepartures.svelte`

## Acceptance Criteria

1. ✅ Destination removed from departure header
2. ✅ Icon always matches segment's transport type
3. ✅ Next departure minutes is 48px and bold
4. ✅ Next departure time is 12px and subtle
5. ✅ Second departure is noticeably smaller than next
6. ✅ "MIN" label included for clarity
