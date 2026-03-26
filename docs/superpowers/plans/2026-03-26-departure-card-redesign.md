# Departure Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign departure card with improved visual hierarchy - big next departure minutes, subtle exact times, remove duplicate destination, fix transport icons.

**Architecture:** Modify SegmentDepartures.svelte to update HTML structure and CSS styling for departure display.

**Tech Stack:** Svelte, CSS

---

## File Structure

- Modify: `src/components/SegmentDepartures.svelte`

---

## Chunk 1: Update HTML Structure

### Task 1: SegmentDepartures.svelte - HTML & Logic

**Files:**
- Modify: `src/components/SegmentDepartures.svelte`

- [ ] **Step 1: Update getTransportIcon to use segment's transportType instead of departure's**

Find the function `getDeparturesForSegment` and change it to also return the segment's transport type, or update the template to use `segment.transportType` directly.

```svelte
<!-- Replace current departure header with: -->
{@const nextDep = deps[0]}
{@const secondDep = deps[1]}
<div class="departure-info">
  {#if deps.length > 0}
    <div class="dep-header">
      <span class="transport-icon">{getTransportIcon(segment.transportType)}</span>
      <span class="line-num">{segment.line}</span>
    </div>
```

- [ ] **Step 2: Update departure times with new visual hierarchy**

Replace the current `.dep-times` section with:

```svelte
    <div class="dep-times">
      {#if deps[0]}
        <div class="dep-next">
          <span class="minutes-large">{deps[0].minutes}</span>
          <span class="min-label">MIN</span>
          <span class="time-subtle">({deps[0].time})</span>
        </div>
      {/if}
      {#if deps[1]}
        <div class="dep-next">
          <span class="minutes-small">{deps[1].minutes}</span>
          <span class="min-label-small">MIN</span>
          <span class="time-subtle">({deps[1].time})</span>
        </div>
      {/if}
    </div>
```

- [ ] **Step 3: Commit changes**

```bash
git add src/components/SegmentDepartures.svelte
git commit -m "refactor: redesign departure card with visual hierarchy"
```

---

## Chunk 2: Update CSS Styles

### Task 2: SegmentDepartures.svelte - Styles

**Files:**
- Modify: `src/components/SegmentDepartures.svelte` (styles section)

- [ ] **Step 1: Update .dep-header styles**

```css
.dep-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
```

- [ ] **Step 2: Replace .dep-times and .dep-time styles with new hierarchy**

Replace current `.dep-times`, `.dep-time`, `.minutes`, `.time` with:

```css
.dep-times {
  display: flex;
  gap: 32px;
  align-items: baseline;
}

.dep-next {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.minutes-large {
  font-size: 48px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}

.min-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 2px;
}

.minutes-small {
  font-size: 24px;
  font-weight: 500;
  color: var(--text);
  line-height: 1;
}

.min-label-small {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 2px;
}

.time-subtle {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Commit changes**

```bash
git add src/components/SegmentDepartures.svelte
git commit -m "style: add visual hierarchy styles for departure times"
```

---

## Verification

- [ ] Run `npm run dev` and check the departure cards
- [ ] Verify next departure minutes is large (48px) and bold
- [ ] Verify exact times are small (12px) and subtle
- [ ] Verify second departure is noticeably smaller than next
- [ ] Verify transport icon matches segment type (not departure API data)
- [ ] Verify destination removed from departure header

---

## Acceptance Criteria

1. ✅ Destination removed from departure header
2. ✅ Icon always matches segment's transport type
3. ✅ Next departure minutes is 48px and bold
4. ✅ Next departure time is 12px and subtle
5. ✅ Second departure is noticeably smaller than next
6. ✅ "MIN" label included for clarity
