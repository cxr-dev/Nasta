import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveVenueMedia, venueMoodImages } from './venueMoodImages';

describe('resolveVenueMedia', () => {
  it('uses provider venue media first and assigns unique mood images to visible cards', () => {
    const venues = Array.from({ length: 12 }, (_, index) => ({ id: `venue-${index}`, name: `Venue ${index}`, _classified: index % 2 ? 'wine' as const : 'beer' as const, imageUrl: index === 0 ? 'https://images.example.test/venue.jpg' : undefined }));
    const resolved = resolveVenueMedia(venues);
    expect(resolved.get('venue-0')).toEqual({ kind: 'venue', imageUrl: 'https://images.example.test/venue.jpg' });
    const moodIds = [...resolved.values()].flatMap((media) => media.kind === 'mood' ? [media.image.id] : []);
    expect(new Set(moodIds).size).toBe(moodIds.length);
    expect(venueMoodImages).toHaveLength(24);
  });

  it('keeps every curated source and photographer profile in the README credits', () => {
    const readme = readFileSync('README.md', 'utf8');
    for (const image of venueMoodImages) {
      expect(readme).toContain(image.originalPhotoUrl);
      expect(readme).toContain(image.photographerProfileUrl);
    }
  });
});
