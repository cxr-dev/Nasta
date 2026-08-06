import type { EventItem } from '../services/eventService';

export type EventMoodCategory = 'concert' | 'theatre' | 'exhibition' | 'food' | 'nightlife' | 'sport' | 'festival';

export type EventMoodImage = {
  id: string;
  category: EventMoodCategory;
  photographer: string;
  photographerProfileUrl: string;
  originalPhotoUrl: string;
};

const sources: Array<[string, EventMoodCategory, string, string, string]> = [
  ['event-concert-1', 'concert', 'Nainoa Shizuru', 'nainoa', 'NcdG9mK3PBY'], ['event-concert-2', 'concert', 'Muneeb S', 'muneebs', '4_M8uIfPEZw'], ['event-concert-3', 'concert', 'Danny Howe', 'dannyhowe', 'bn-D2bCvpik'], ['event-concert-4', 'concert', 'Yvette de Wit', 'yvettedewit', 'NYrVisodQ2M'],
  ['event-theatre-1', 'theatre', 'Rob Laughter', 'roblaughter', 'WW1jsInXgwM'], ['event-theatre-2', 'theatre', 'Kyle Head', 'kyleunderscorehead', 'p6rNTdAPbuk'], ['event-theatre-3', 'theatre', 'nooooodles', 'nooooodles', 'm3th3rIQ9-w'], ['event-theatre-4', 'theatre', 'team voyas', 'voyas', 'bvHWrljtz8U'],
  ['event-exhibition-1', 'exhibition', 'Zalfa Imani', 'zalfaimani', '1xp5VxvyKL0'], ['event-exhibition-2', 'exhibition', 'Jessica Pamp', 'yessijes', 'JNTSoyb_bbw'], ['event-exhibition-3', 'exhibition', 'Klaudia Piaskowska', 'cloudyaaa', 'g55bG1O5Lf0'], ['event-exhibition-4', 'exhibition', 'Mike Von', 'thevoncomplex', 'v9-ZW3VONcw'],
  ['event-food-1', 'food', 'Thomas Le', 'thomasble', 'pRJhn4MbsMM'], ['event-food-2', 'food', 'Christian Mackie', 'mackiec', 'PBvFpF3f624'], ['event-food-3', 'food', 'nrd', 'nicotitto', 'D6Tu_L3chLE'], ['event-food-4', 'food', 'Jacopo Maiarelli', 'ja_ma', '-gOUx23DNks'],
  ['event-nightlife-1', 'nightlife', 'Yiran Ding', 'yiranding', 'JQRyYCC2OIM'], ['event-nightlife-2', 'nightlife', 'Zac Ong', 'zacong', 'JHN1-mpgXjo'], ['event-nightlife-3', 'nightlife', 'Henry Chen', 'chentianlu', 'x7clQSWhlfE'], ['event-nightlife-4', 'nightlife', 'Katherine Gu', 'katherine_xx11', '2CotQSBTcjI'],
  ['event-sport-1', 'sport', 'Igor Batista', 'igorvw', 'MPhf5gE1qrI'], ['event-sport-2', 'sport', 'Anna Sullivan', 'aesullivan2010', 'DioLM8ViiO8'], ['event-sport-3', 'sport', 'Piero Huerto Gago', 'piero_hg', '2rjjnfdlwGY'], ['event-sport-4', 'sport', 'Jake Weirick', 'weirick', 'o9h6KJG52eU'],
  ['event-festival-1', 'festival', 'Nainoa Shizuru', 'nainoa', 'NcdG9mK3PBY'], ['event-festival-2', 'festival', 'Muneeb S', 'muneebs', '4_M8uIfPEZw'], ['event-festival-3', 'festival', 'Danny Howe', 'dannyhowe', 'bn-D2bCvpik'], ['event-festival-4', 'festival', 'Yvette de Wit', 'yvettedewit', 'NYrVisodQ2M'],
];

/** Curated editorial images. They describe an event category, never the event itself. */
export const eventMoodImages: EventMoodImage[] = sources.map(([id, category, photographer, handle, photoId]) => ({
  id,
  category,
  photographer,
  photographerProfileUrl: `https://unsplash.com/@${handle}`,
  originalPhotoUrl: `https://unsplash.com/photos/${photoId}`,
}));

const categorySlugs: Record<EventMoodCategory, string[]> = {
  concert: ['concert', 'concerts', 'music', 'live-music', 'musik', 'musical', 'opera', 'jazz'],
  theatre: ['theatre', 'theater', 'teater', 'performing-arts', 'performance', 'dance', 'ballet', 'comedy', 'stand-up'],
  exhibition: ['exhibition', 'exhibitions', 'art', 'arts', 'konst', 'museum', 'gallery', 'photography', 'design'],
  food: ['food', 'food-and-drink', 'mat', 'gastronomy', 'wine', 'beer', 'restaurant', 'market'],
  nightlife: ['nightlife', 'night-life', 'nightclub', 'club', 'bar', 'party', 'afterwork'],
  sport: ['sport', 'sports', 'sporting-event', 'fitness', 'running', 'football', 'hockey'],
  festival: ['festival', 'festivals', 'fair', 'fairs'],
};

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) | 0;
  return result >>> 0;
}

export function eventMoodCategory(event: EventItem): EventMoodCategory | undefined {
  const slugs = new Set((event.categories ?? []).map((category) => category.slug.trim().toLowerCase()));
  for (const [category, aliases] of Object.entries(categorySlugs) as Array<[EventMoodCategory, string[]]>) {
    if (aliases.some((alias) => slugs.has(alias))) return category;
  }
  return undefined;
}

/** Resolve only high-confidence activity categories; neutral fallbacks are better for ambiguous labels. */
export function resolveEventMoodMedia(events: EventItem[]): Map<string, EventMoodImage> {
  const resolved = new Map<string, EventMoodImage>();
  const usedByCategory = new Map<EventMoodCategory, Set<string>>();
  for (const event of events.slice(0, 12)) {
    const category = eventMoodCategory(event);
    if (!category) continue;
    const pool = eventMoodImages.filter((image) => image.category === category);
    const used = usedByCategory.get(category) ?? new Set<string>();
    const start = hash(`${event.id}:${category}`) % pool.length;
    let image = pool[start];
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidate = pool[(start + offset) % pool.length];
      if (!used.has(candidate.id)) { image = candidate; break; }
    }
    used.add(image.id);
    usedByCategory.set(category, used);
    resolved.set(event.id, image);
  }
  return resolved;
}

export function eventMoodImagePath(image: EventMoodImage, format: 'avif' | 'webp'): string {
  return `${import.meta.env.BASE_URL}venue-mood/${image.id}.${format}`;
}
