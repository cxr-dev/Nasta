import type { TransportType } from '../types/route';

export const transportIcons: Record<TransportType, string> = {
  // Modern front-facing bus with sleek, rounded corners and minimal detail
  bus: '<path d="M19 4H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h.2c-.1.3-.2.7-.2 1 0 1.1.9 2 2 2s2-.9 2-2c0-.3-.1-.7-.2-1h6c-.1.3-.2.7-.2 1 0 1.1.9 2 2 2s2-.9 2-2c0-.3-.1-.7-.2-1h.2c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM6.5 15c-.8 0-1.5-.7-1.5-1.5S5.7 12 6.5 12s1.5.7 1.5 1.5S7.3 15 6.5 15zm11 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zM18 10H6V7h12v3z"/>',
  // Modern high-speed train/commuter rail, sleek and streamlined
  train: '<path d="M12 2c-4 0-8 .5-8 4v11c0 2.2 1.8 4 4 4l-1 1v1h10v-1l-1-1c2.2 0 4-1.8 4-4V6c0-3.5-4-4-8-4zm5 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm-10 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm11-6H6V6h12v5z"/>',
  // Iconic Stockholm 'T' logo style but modernized/minimalized
  metro: '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm5 10h-3v7h-4v-7H7V9h10v3z"/>',
  // The existing boat icon (already loved)
  boat: '<path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z"/>'
};

export const transportLabels: Record<TransportType, string> = {
  bus: 'Buss',
  train: 'Tåg',
  metro: 'Tunnelbana',
  boat: 'Färja'
};

export const transportOptions: { value: TransportType; label: string; icon: string }[] = [
  { value: 'bus', label: transportLabels.bus, icon: transportIcons.bus },
  { value: 'train', label: transportLabels.train, icon: transportIcons.train },
  { value: 'metro', label: transportLabels.metro, icon: transportIcons.metro },
  { value: 'boat', label: transportLabels.boat, icon: transportIcons.boat }
];

export const directionIcons = {
  toWork: 'M12 7V3H2v20h20V17h-4v-2h6V7h-6v4h-2V7h4zm-2 14v-4h4v-2h-6v4h-4v6h6v-4h2zm2-2h4v2h-4v-2zm-6 2h4v2h-4v-2zm0-6h10v2H8v-2z',
  fromWork: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
};