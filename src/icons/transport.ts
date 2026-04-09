import type { TransportType } from '../types/route';

export const transportIcons: Record<TransportType, string> = {
  bus: '<path d="M4 6.5C4 4.57 5.57 3 7.5 3h9c1.93 0 3.5 1.57 3.5 3.5v9c0 1.93-1.57 3.5-3.5 3.5h-.5v2.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-1.5h.5c.83 0 1.5-.67 1.5-1.5v-1h2c.83 0 1.5-.67 1.5-1.5V6.5c0-2.71-2.19-4.5-5.5-4.5h-9C6.19 2 4 3.79 4 6.5v9.5h2v-9.5zm1.5 0c0-.83.67-1.5 1.5-1.5h10c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5h-10c-.83 0-1.5-.67-1.5-1.5v-10zM7 14h2v2H7v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2z"/>',
  train: '<path d="M12 2c-4 0-8 2-8 6v6h2v-1h2v1h8v-1h2v1h2V8c0-4-4-6-8-6zm0 2c3.5 0 6 1.5 6 3.3V9H6V7.3C6 5.5 8.5 4 12 4zm-6 7h12v8H6v-8zm3 3c.83 0 1.5.67 1.5 1.5S9.83 17 9 17s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm4.5 0c.83 0 1.5.67 1.5 1.5S14.33 17 13.5 17s-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z"/>',
  metro: '<path d="M8.5 4C6.57 4 5 5.57 5 7.5V19c0 1.1.9 2 2 2h1v-2H7v-2h10v2h-1v2h1c1.1 0 2-.9 2-2V7.5C16 5.57 14.43 4 12.5 4h-4zm0 2h4c.83 0 1.5.67 1.5 1.5V9H7v-1.5c0-.83.67-1.5 1.5-1.5zm0 3h4v6.5c0 .83-.67 1.5-1.5 1.5h-1c-.83 0-1.5-.67-1.5-1.5V9zm2 2v4.5c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5V9h-3z"/>',
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