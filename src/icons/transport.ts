import type { TransportType } from '../types/route';

export const transportIcons: Record<TransportType, string> = {
  // Source style: rounded outline icons inspired by Lucide/Tabler transit set.
  bus: '<rect x="4" y="5" width="16" height="12" rx="2.5" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="17.5" r="1.5" /><circle cx="16" cy="17.5" r="1.5" />',
  train: '<rect x="6" y="3.5" width="12" height="13.5" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 7.5h7M9 19l-2 2M15 19l2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  metro: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8.5h8M12 8.5v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
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
