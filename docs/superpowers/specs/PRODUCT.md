# Product Specification: Nästa

> Last updated: 2026-03-26

## 1. Product Overview

**Nästa** (Swedish for "Next") is a minimalist personal commute dashboard for Stockholm public transport (SL).

### Mission Statement
Enable Stockholm commuters to instantly see their next departures and estimated arrival time with zero friction—single screen, zero ads, works offline.

### Target Audience
- Daily commuters using SL buses, metro, commuter trains, and ferries
- Users who prioritize speed and simplicity over features
- People who want a PWA that feels like a native app

---

## 2. Problem Statement

Stockholm commuters currently face:
- **Multiple apps**: SL, Trafikverket, ferry apps—too many to check
- **Cluttered interfaces**: Ads, news feeds, irrelevant departure info
- **Slow loading**: Apps that require login, heavy bundles, network delays
- **No offline**: Poor signal at metro stations = no departure info

---

## 3. Solution

A single-page PWA that shows:
1. The next 2 departures for each segment of your route
2. Expected arrival time at final destination
3. Works offline with cached data
4. Loads in < 1 second
5. Zero ads, zero clutter

---

## 4. Feature Specifications

### 4.1 Route Management

| Feature | Description | Priority |
|---------|-------------|----------|
| Two predefined routes | "Till jobbet" (to work) and "Hem" (home) | Required |
| Segment-based routes | Each route = ordered list of from→to segments | Required |
| Travel time | Each segment has travel time in minutes | Required |
| Touch drag reordering | Long-press to drag segments on mobile | Required |
| LocalStorage persistence | Routes saved automatically | Required |

**Segment Data Model**:
```typescript
interface Segment {
  id: string;
  fromStop: Stop;
  toStop: Stop;
  line: string;           // e.g., "76"
  destination: string;    // e.g., "Klingsta"
  transportType: "bus" | "train" | "metro" | "boat";
  travelTimeMinutes: number;
  departureTime: string; // HH:mm of next departure
}
```

### 4.2 Real-Time Departures

| Feature | Description | Priority |
|---------|-------------|----------|
| Next 2 departures | Show next + one after for context | Required |
| Auto-refresh | Refresh every 30 seconds | Required |
| Time until departure | Display as "X min" + planned time "08:04" | Required |
| Line + destination | Show line number + final stop | Required |
| Transport icons | Visual distinction: bus (blue), train (green), metro (red), boat (white) | Required |
| Filter by line/destination | Only show departures matching segment's line/destination | Required |

**Display Hierarchy**:
1. **Primary**: Next departure time in 56px bold (glanceable)
2. **Secondary**: Second departure in 28px (context)
3. **Tertiary**: Transport type + line number (small, colored circle)
4. **From → To**: Origin → Destination in header

### 4.3 Hybrid Ferry Support

| Feature | Description | Priority |
|---------|-------------|----------|
| SL API for regular transit | Fetch departures via Trafiklab SL API | Required |
| Static timetable for Sjöstadstrafiken | Hardcoded schedule for Luma brygga ↔ Barnängen ↔ Henriksdal | Required |
| Ferry badge in search | Show "Färja" badge for ferry stops in search results | Required |
| Auto-detection | Detect ferry stops by name, use static timetable | Required |

**Sjöstadstrafiken Ferries**:
- Luma brygga ↔ Barnängen ↔ Henriksdal
- Schedule hardcoded in `staticTimetable.ts`
- Departures shown as "Scheduled" (not real-time)

### 4.4 Arrival Time Calculation

| Feature | Description | Priority |
|---------|-------------|----------|
| Sum travel times | Segment 1 travel + Segment 2 travel + ... | Required |
| Add first wait time | Add wait for first segment's departure | Required |
| Display final arrival | Show expected arrival time at final destination | Required |

### 4.5 PWA / Installability

| Feature | Description | Priority |
|---------|-------------|----------|
| Web app manifest | `manifest.json` with icons, theme, display | Required |
| Service worker | Offline support via vite-plugin-pwa | Required |
| Install prompt | "Add to home screen" on mobile | Required |
| Cache-busting | Version params + headers to prevent stale cache | Required |

### 4.6 Search & Discovery

| Feature | Description | Priority |
|---------|-------------|----------|
| Stop search | Debounced input, queries SL API | Required |
| Exact match priority | Exact name match sorted first, then startsWith, then includes | Required |
| Search result badges | Show transport type badges (Tunnelbana, Buss, Färja) | Required |
| Recent stops | Show 5 most recently searched stops | Optional |

---

## 5. User Interactions

### 5.1 Main Dashboard

```
┌─────────────────────────────────┐
│  [Nästa Logo]              [⚙️]  │
├─────────────────────────────────┤
│  [Till jobbet]  [Hem]           │  ← Route tabs (full width)
├─────────────────────────────────┤
│  ┌─────────────────────────────┐│
│  │ 🚇 19  │ Södertälje centrum   ││  ← Segment card
│  │        │ Från Södertälje hamn ││
│  │        │ ──────────────→     ││
│  │   4 min (08:04)              ││  ← Primary: 56px bold
│  │   12 min (08:12)             ││  ← Secondary: 28px
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ 🚢 82  │ Henriksdal          ││
│  │        │ Från Luma brygga    ││
│  │   6 min (08:10)              ││
│  │  18 min (08:22)              ││
│  └─────────────────────────────┘│
│                                 │
│  📍 Anländer 08:34              │  ← Calculated arrival
├─────────────────────────────────┤
│       [ Redigera ]              │  ← Fixed bottom bar
└─────────────────────────────────┘
```

### 5.2 Route Editor (Edit Mode)

```
┌─────────────────────────────────┐
│  ← Redigera: Till jobbet        │  ← Back button + title
├─────────────────────────────────┤
│  [ 🔍 Sök hållplats...       ]  │  ← Search input
├─────────────────────────────────┤
│  ┌─ Luma brygga ─────────────┐  │
│  │ ☰                         │  │  ← Drag handle
│  │ Från: Luma brygga         │  │
│  │ Till: [ Sök...         ]  │  │  ← Tap to select destination
│  │ Restid: [ 5 min ]        │  │
│  └───────────────────────────┘  │
│                                 │
│  [ + Lägg till nytt segment ]   │  ← Add button
├─────────────────────────────────┤
│       [ Spara ]                 │  ← Save button
└─────────────────────────────────┘
```

### 5.3 Stop Search

```
┌─────────────────────────────────┐
│  [ 🔍 Sök hållplats...       ]  │
│  └─────────────────────────────┘│
├─────────────────────────────────┤
│  📍 Lindarängsvägen         [+]  │  ← Exact match (top)
│  📍 Lindarängsvägen (Värmdö)[+]  │
│  📍 Linde                      [+]│
│  ⛴️ Luma brygga      [Färja][+]  │  ← Ferry badge
│  🚇 Södertälje centrum   [+]    │  ← Metro badge
└─────────────────────────────────┘
```

---

## 6. Visual Design

### 6.1 Design Principles

1. **Minimalist Scandinavian**: Clean lines, ample whitespace, muted colors
2. **Mobile-first**: Large touch targets, thumb-friendly placement
3. **Glanceable**: Primary information in 56px bold for readability at arm's length
4. **Dark mode default**: Easy on eyes in low-light environments (metro, evening)

### 6.2 Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Background | `#0a0a0a` | Main background (dark) |
| Surface | `#1a1a1a` | Cards, elevated surfaces |
| Surface light | `#2a2a2a` | Input backgrounds |
| Text primary | `#ffffff` | Main text |
| Text secondary | `#888888` | Labels, secondary info |
| Accent blue | `#0066ff` | Primary buttons, links |
| Bus | `#0066ff` | Bus transport icon |
| Train | `#27ae60` | Train transport icon |
| Metro | `#e74c3c` | Metro transport icon |
| Ferry | `#3498db` | Boat/ferry transport icon |

### 6.3 Typography

| Element | Size | Weight |
|---------|------|--------|
| Next departure | 56px | 700 (bold) |
| Second departure | 28px | 400 |
| Route tabs | 16px | 600 |
| Card header | 14px | 400 |
| Labels | 12px | 400 |

### 6.4 Layout

- **Route tabs**: Full width, equal split, centered active state
- **Segment cards**: Full width minus 16px margin, 12px border-radius
- **Bottom bar**: Fixed, full width, 56px height
- **Touch targets**: Minimum 44px × 44px

---

## 7. Technical Constraints

### 7.1 API Rate Limits

- SL API: ~1000 requests/day (per API key)
- Cache departures for 30 seconds to reduce calls

### 7.2 LocalStorage Quota

- ~5MB available
- Routes are small; no practical limit on number of segments

### 7.3 Browser Support

- Chrome, Safari, Firefox (latest 2 versions)
- iOS Safari, Chrome for iOS
- Samsung Internet

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1s |
| Lighthouse Performance | > 90 |
| PWA Lighthouse | > 90 |
| Offline functionality | Works with 0 network |
| Time to departure glance | < 2 seconds from open |

---

## 9. Roadmap (Future)

### 9.1 Near-term
- [ ] Save multiple route configurations (not just 2)
- [ ] Notification when departure is approaching
- [ ] Widget support for iOS/Android home screen

### 9.2 Medium-term
- [ ] Historical accuracy tracking (how often are times wrong?)
- [ ] Widget complications for Apple Watch
- [ ] iOS/Android native shell

### 9.3 Long-term
- [ ] Crowdsourced real-time ferry positions
- [ ] Alternative route suggestions when disruptions
- [ ] Integration with calendar for automatic departure times

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **SL** | Stockholms Lokaltrafik - Stockholm's public transport authority |
| **Segment** | A single leg of a route (from stop → to stop) |
| **Route** | Ordered collection of segments forming a complete journey |
| **Sjöstadstrafiken** | Ferry service in central Stockholm (Luma, Barnängen, Henriksdal) |
| **PWA** | Progressive Web App - installable web app with offline support |
| **Trafiklab** | Platform providing SL API access |
