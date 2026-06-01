import type { TransportType } from '../types/route';

export const transportIcons: Record<TransportType, string> = {
  // Source style: rounded outline icons inspired by Lucide/Tabler transit set.
  bus: '<path d="M6 24h-2c-.552 0-1-.448-1-1v-1c-.53 0-1.039-.211-1.414-.586s-.586-.884-.586-1.414v-8c-.552 0-1-.448-1-1v-3c0-.552.448-1 1-1v-4c0-1.657 1.343-3 3-3h16c1.657 0 3 1.343 3 3v4c.552 0 1 .448 1 1v3c0 .552-.448 1-1 1v8c0 .53-.211 1.039-.586 1.414s-.884.586-1.414.586v1c0 .552-.448 1-1 1h-2c-.552 0-1-.448-1-1v-1h-10v1c0 .552-.448 1-1 1zm-1.5-7c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5-1.5-.672-1.5-1.5.672-1.5 1.5-1.5zm15 0c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5-1.5-.672-1.5-1.5.672-1.5 1.5-1.5zm-5 1h-5c-.276 0-.5.224-.5.5s.224.5.5.5h5c.276 0 .5-.224.5-.5s-.224-.5-.5-.5zm6.5-12.5c0-.276-.224-.5-.5-.5h-17c-.276 0-.5.224-.5.5v8.5s3.098 1 9 1 9-1 9-1v-8.5zm-5-3.5h-8v1h8v-1z"/>',
  train: '<rect x="6" y="3.5" width="12" height="13.5" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 7.5h7M9 19l-2 2M15 19l2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  metro: '<path d="M48.89,48.14h1.27a6,6,0,0,0,6-6v-36a6,6,0,0,0-6-6H21.84a6,6,0,0,0-6,6v36a6,6,0,0,0,6,6h1.27L14.55,55.8H20l2.74-2.45H49.31l2.74,2.45h5.4ZM48,44.45a3,3,0,1,1,3-3A2.95,2.95,0,0,1,48,44.45Zm-18.72-42H42.71a1.65,1.65,0,0,1,0,3.3H29.29a1.65,1.65,0,1,1,0-3.3ZM18.84,26.25V11.15a3,3,0,0,1,3-3H50.16a3,3,0,0,1,3,3v15.1a3,3,0,0,1-3,3H21.84A3,3,0,0,1,18.84,26.25ZM21,41.5a3,3,0,1,1,2.95,3A2.95,2.95,0,0,1,21,41.5Zm5.67,8.25,1.78-1.61H43.58l1.71,1.61Z"/>',
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
