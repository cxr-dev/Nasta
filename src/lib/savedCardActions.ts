import type { Page, Segment } from '../types/page';

export type SavedCardKind = 'departure' | 'journey';
export type SavedCardActionId = 'share' | 'edit' | 'move' | 'remove';

export interface SavedCardAction {
  id: SavedCardActionId;
  label: string;
  destructive?: boolean;
}

export function getSavedCardKind(segment: Segment): SavedCardKind {
  return segment.journeyMeta ? 'journey' : 'departure';
}

export function getSavedCardActions(
  segment: Segment,
  pages: Page[],
  labels: { share: string; edit: string; move: string; remove: string },
): SavedCardAction[] {
  const kind = getSavedCardKind(segment);
  const actions: SavedCardAction[] = [];

  actions.push({ id: 'share', label: labels.share });

  if (!(kind === 'journey' && segment.journeyMeta?.status === 'active')) {
    actions.push({ id: 'edit', label: labels.edit });
  }

  if (pages.length > 1) {
    actions.push({ id: 'move', label: labels.move });
  }

  actions.push({ id: 'remove', label: labels.remove, destructive: true });
  return actions;
}

export function getSavedCardAccessibleName(segment: Segment): string {
  if (segment.journeyMeta) {
    return `journey to ${segment.journeyMeta.destLabel}`;
  }
  return `departure ${segment.line} from ${segment.fromStop.name}`;
}
