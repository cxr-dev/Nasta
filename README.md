# Nästa

A minimalist personal commute dashboard for Stockholm public transport (SL).

## Features

- Next departures display
- Multiple stops management
- Expected arrival time calculation
- Route configuration (Jobb/Hem)
- Dark mode (default)
- Auto refresh every 30 seconds
- PWA installable
- Works offline

## Tech Stack

- Vite
- Svelte
- TypeScript
- LocalStorage
- SL Transport API

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

### Testing

```bash
npm run test        # Unit tests
npm run test:e2e   # E2E tests
```

## Configuration

Routes are stored in LocalStorage. To configure:
1. Click "Redigera" button
2. Search for stops using the search bar
3. Add travel times between stops
4. Changes are saved automatically

## Deployment

The app automatically deploys to GitHub Pages on push to main branch.

## License

MIT
