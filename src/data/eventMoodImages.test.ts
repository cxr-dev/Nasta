import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { eventMoodCategory, eventMoodImages, resolveEventMoodMedia } from './eventMoodImages';

const event = (id: string, slug?: string) => ({
  id,
  name: id,
  categories: slug ? [{ slug, title: slug }] : undefined,
});

describe('eventMoodImages', () => {
  it('maps only high-confidence category slugs and leaves ambiguous categories neutral', () => {
    expect(eventMoodCategory(event('concert', 'music'))).toBe('concert');
    expect(eventMoodCategory(event('theatre', 'teater'))).toBe('theatre');
    expect(eventMoodCategory(event('exhibition', 'museum'))).toBe('exhibition');
    expect(eventMoodCategory(event('food', 'food-and-drink'))).toBe('food');
    expect(eventMoodCategory(event('nightlife', 'nightclub'))).toBe('nightlife');
    expect(eventMoodCategory(event('sport', 'sport'))).toBe('sport');
    expect(eventMoodCategory(event('festival', 'festival'))).toBe('festival');
    expect(eventMoodCategory(event('family', 'children'))).toBeUndefined();
    expect(eventMoodCategory(event('culture', 'literature'))).toBeUndefined();
    expect(eventMoodCategory(event('unknown', 'other'))).toBeUndefined();
    expect(eventMoodCategory(event('missing'))).toBeUndefined();
  });

  it('is deterministic, stays in its event-only pool, and avoids repeats in a short list', () => {
    const events = Array.from({ length: 4 }, (_, index) => event(`music-${index}`, 'music'));
    const first = resolveEventMoodMedia(events);
    const second = resolveEventMoodMedia(events);
    expect([...first.entries()]).toEqual([...second.entries()]);
    const images = [...first.values()];
    expect(images.every((image) => image.category === 'concert')).toBe(true);
    expect(new Set(images.map((image) => image.id)).size).toBe(images.length);
    expect(eventMoodImages).toHaveLength(28);
  });

  it('keeps every curated source and photographer profile in the README credits', () => {
    const readme = readFileSync('README.md', 'utf8');
    for (const image of eventMoodImages) {
      expect(readme).toContain(image.originalPhotoUrl);
      expect(readme).toContain(image.photographerProfileUrl);
    }
  });
});
