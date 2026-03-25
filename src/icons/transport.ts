import type { TransportType } from '../types/route';

export const transportIcons: Record<TransportType, string> = {
  bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1 .55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31-2.69-6-6-6S4 2.69 4 6v10zm9 0c0 .88-.39 1.67-1 2.22V20c0 .55-.45 1-1 1-.55 0-1-.45-1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.31 2.69-6 6-6s6 2.69 6 6v10zm-9-10v10',
  train: 'M4 15c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8H4v7zm8-5h-2v2h2v-2zm0 3h-2v2h2v-2zm0 3h-2v2h2v-2zM7.5 6h9v1h-9V6z',
  metro: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z',
  boat: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19z'
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
  toWork: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  fromWork: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
};