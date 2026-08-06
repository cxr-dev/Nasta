import type { Venue } from '../services/venueService';

export type VenueMoodCategory = 'beer' | 'wine' | 'cocktail';

export type VenueMoodImage = {
  id: string;
  categories: VenueMoodCategory[];
  photographer: string;
  photographerProfileUrl: string;
  originalPhotoUrl: string;
};

/** Curated, locally hosted images. They describe an after-work atmosphere, never a venue. */
export const venueMoodImages: VenueMoodImage[] = [
  { id: 'beer-bottles', categories: ['beer'], photographer: 'Daniel', photographerProfileUrl: 'https://unsplash.com/@unsplashbydan', originalPhotoUrl: 'https://unsplash.com/photos/c3YF1RU1tis' },
  { id: 'beer-table', categories: ['beer'], photographer: 'Bohdan Stocek', photographerProfileUrl: 'https://unsplash.com/@bohdans', originalPhotoUrl: 'https://unsplash.com/photos/Pjdv-RjOmGs' },
  { id: 'beer-pendants', categories: ['beer'], photographer: 'Akaki Khotcholava', photographerProfileUrl: 'https://unsplash.com/@khotcholava1', originalPhotoUrl: 'https://unsplash.com/photos/JDC13vBkDv0' },
  { id: 'beer-menu', categories: ['beer'], photographer: 'Haberdoedas', photographerProfileUrl: 'https://unsplash.com/@haberdoedas', originalPhotoUrl: 'https://unsplash.com/photos/hlzE8sd6Anc' },
  { id: 'beer-taps-orange', categories: ['beer'], photographer: 'Haberdoedas', photographerProfileUrl: 'https://unsplash.com/@haberdoedas', originalPhotoUrl: 'https://unsplash.com/photos/WXKune1m3oM' },
  { id: 'beer-bar-room', categories: ['beer'], photographer: 'Aleksey Cherenkevich', photographerProfileUrl: 'https://unsplash.com/@cherenkevich', originalPhotoUrl: 'https://unsplash.com/photos/ktGhPU_eBV8' },
  { id: 'beer-food', categories: ['beer'], photographer: 'Boris Izmaylov', photographerProfileUrl: 'https://unsplash.com/@borisizmaylov', originalPhotoUrl: 'https://unsplash.com/photos/GKAtssAFJM8' },
  { id: 'beer-glasses', categories: ['beer'], photographer: 'Haberdoedas', photographerProfileUrl: 'https://unsplash.com/@haberdoedas', originalPhotoUrl: 'https://unsplash.com/photos/hwAVIsqJQBA' },
  { id: 'wine-cellar', categories: ['wine'], photographer: 'Hai Nguyen', photographerProfileUrl: 'https://unsplash.com/@hai_nguyen', originalPhotoUrl: 'https://unsplash.com/photos/ctzU0vk2hqk' },
  { id: 'wine-display', categories: ['wine'], photographer: 'Yaxuan Liu', photographerProfileUrl: 'https://unsplash.com/@seeulater', originalPhotoUrl: 'https://unsplash.com/photos/5b7Tmar2-Ig' },
  { id: 'wine-shelves', categories: ['wine'], photographer: 'Dima Solomin', photographerProfileUrl: 'https://unsplash.com/@solomin_d', originalPhotoUrl: 'https://unsplash.com/photos/cXhLFvFfi6U' },
  { id: 'wine-glasses', categories: ['wine'], photographer: 'Romain HUNEAU', photographerProfileUrl: 'https://unsplash.com/@honni', originalPhotoUrl: 'https://unsplash.com/photos/Dopd4VCYQjM' },
  { id: 'wine-counter', categories: ['wine'], photographer: 'María Del Mar García', photographerProfileUrl: 'https://unsplash.com/@photo_mdgr', originalPhotoUrl: 'https://unsplash.com/photos/uln7leAbXUI' },
  { id: 'wine-dining', categories: ['wine'], photographer: 'Yanhao Fang', photographerProfileUrl: 'https://unsplash.com/@alamanga', originalPhotoUrl: 'https://unsplash.com/photos/5PSEDvGlTXc' },
  { id: 'wine-stools', categories: ['wine'], photographer: 'Shawn DENG', photographerProfileUrl: 'https://unsplash.com/@dzshawn', originalPhotoUrl: 'https://unsplash.com/photos/nsgzQHsxbXE' },
  { id: 'wine-racks', categories: ['wine'], photographer: 'Franco Debartolo', photographerProfileUrl: 'https://unsplash.com/@francotheshooter', originalPhotoUrl: 'https://unsplash.com/photos/HkybwP2PorY' },
  { id: 'cocktail-martini', categories: ['cocktail'], photographer: 'Ambitious Studio | Rick Barrett', photographerProfileUrl: 'https://unsplash.com/@weareambitious', originalPhotoUrl: 'https://unsplash.com/photos/QjUY7auDzUQ' },
  { id: 'cocktail-bottles', categories: ['cocktail'], photographer: 'Ambitious Studio | Rick Barrett', photographerProfileUrl: 'https://unsplash.com/@weareambitious', originalPhotoUrl: 'https://unsplash.com/photos/8faBJjLhWoo' },
  { id: 'cocktail-lounge', categories: ['cocktail'], photographer: 'Ambitious Studio | Rick Barrett', photographerProfileUrl: 'https://unsplash.com/@weareambitious', originalPhotoUrl: 'https://unsplash.com/photos/L-VilLa6n_I' },
  { id: 'cocktail-plants', categories: ['cocktail'], photographer: 'Ambitious Studio | Rick Barrett', photographerProfileUrl: 'https://unsplash.com/@weareambitious', originalPhotoUrl: 'https://unsplash.com/photos/RgugaEqIFAI' },
  { id: 'cocktail-glass', categories: ['cocktail'], photographer: 'Anastasiia Krutota', photographerProfileUrl: 'https://unsplash.com/@krutota', originalPhotoUrl: 'https://unsplash.com/photos/EX8UtPjOFhY' },
  { id: 'cocktail-glasses', categories: ['cocktail'], photographer: 'Ambitious Studio | Rick Barrett', photographerProfileUrl: 'https://unsplash.com/@weareambitious', originalPhotoUrl: 'https://unsplash.com/photos/SirIM8Pv1Rs' },
  { id: 'cocktail-red', categories: ['cocktail'], photographer: 'Laure Noverraz', photographerProfileUrl: 'https://unsplash.com/@lornov', originalPhotoUrl: 'https://unsplash.com/photos/3Dh2KgJHLZc' },
  { id: 'cocktail-table', categories: ['cocktail'], photographer: 'Durenne Loris', photographerProfileUrl: 'https://unsplash.com/@abstra_be', originalPhotoUrl: 'https://unsplash.com/photos/vJAOEbcCr8o' },
];

export type VenueMedia =
  | { kind: 'venue'; imageUrl: string }
  | { kind: 'mood'; image: VenueMoodImage };

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) | 0;
  return result >>> 0;
}

function venueCategory(venue: Venue): VenueMoodCategory {
  if (venue._classified === 'cocktail' || venue.isSpecificCocktail) return 'cocktail';
  if (venue._classified === 'wine' || venue.isSpecificWine) return 'wine';
  return 'beer';
}

/** Resolve only the currently displayed list so no visible card reuses a mood image. */
export function resolveVenueMedia(venues: Venue[]): Map<string, VenueMedia> {
  const resolved = new Map<string, VenueMedia>();
  const used = new Set<string>();
  for (const venue of venues.slice(0, 12)) {
    if (venue.imageUrl) {
      resolved.set(venue.id, { kind: 'venue', imageUrl: venue.imageUrl });
      continue;
    }
    const category = venueCategory(venue);
    const preferred = venueMoodImages.filter((image) => image.categories.includes(category));
    const pool = [...preferred, ...venueMoodImages.filter((image) => !preferred.includes(image))];
    const start = hash(`${venue.id}:${category}`) % pool.length;
    let image = pool[start];
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidate = pool[(start + offset) % pool.length];
      if (!used.has(candidate.id)) {
        image = candidate;
        break;
      }
    }
    used.add(image.id);
    resolved.set(venue.id, { kind: 'mood', image });
  }
  return resolved;
}

export function moodImagePath(image: VenueMoodImage, format: 'avif' | 'webp'): string {
  return `${import.meta.env.BASE_URL}venue-mood/${image.id}.${format}`;
}
