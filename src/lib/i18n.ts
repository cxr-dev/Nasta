export type Locale = 'sv' | 'en';

const sv = {
  // Route labels
  toWork: 'TILL JOBBET',
  home: 'HEM',
  swipeHintToWork: '→ svep för att byta rutt',
  swipeHintHome: '← svep för att byta rutt',

  // BottomBar
  arriving: 'Anländer',
  save: 'Spara',
  edit: 'Redigera',
  saveAriaLabel: 'Spara ändringar',
  editAriaLabel: 'Redigera rutter',

  // RouteEditor
  closeEditor: 'Stäng redigering',
  editingRoute: 'Redigera',
  cancel: 'Avbryt',
  addSegment: '+ Lägg till segment',
  switchTo: 'Byt till',
  settings: 'Inställningar',
  showNotifications: 'Visa notiser',
  notificationsDesc: 'Roliga meddelanden baserade på tid och väder',
  theme: 'Tema',

  // SegmentList
  addSegmentHint: 'Lägg till resesegment nedan',
  remove: 'Ta bort',

  // SegmentSearch
  searchPlaceholder: 'Sök hållplats...',
  searching: 'Söker...',
  noStops: 'Inga hållplatser hittades',
  loadingDepartures: 'Laddar avgångar...',
  noDepartures: 'Inga avgångar hittades',
  back: '← Tillbaka',
  select: 'Välj →',
  schedule: 'Tidtabell',

  // App empty states
  noRoutes: 'Inga rutter ännu',
  noRoutesDesc: 'Skapa din första rutt för att se avgångar',
  createRoute: 'Skapa rutt',
  noSegments: 'Inga segment',
  noSegmentsDesc: 'Lägg till avgångar för att komma igång',
  add: 'Lägg till',

  // Update banner
  updateAvailable: 'Ny version tillgänglig!',
  reload: 'Ladda om',

  // Attribution
  attribution: 'Trafikdata via',
};

const en: typeof sv = {
  toWork: 'TO WORK',
  home: 'HOME',
  swipeHintToWork: '→ swipe to switch route',
  swipeHintHome: '← swipe to switch route',

  arriving: 'Arriving',
  save: 'Save',
  edit: 'Edit',
  saveAriaLabel: 'Save changes',
  editAriaLabel: 'Edit routes',

  closeEditor: 'Close editor',
  editingRoute: 'Editing',
  cancel: 'Cancel',
  addSegment: '+ Add segment',
  switchTo: 'Switch to',
  settings: 'Settings',
  showNotifications: 'Show notifications',
  notificationsDesc: 'Fun messages based on time and weather',
  theme: 'Theme',

  addSegmentHint: 'Add travel segments below',
  remove: 'Remove',

  searchPlaceholder: 'Search stop...',
  searching: 'Searching...',
  noStops: 'No stops found',
  loadingDepartures: 'Loading departures...',
  noDepartures: 'No departures found',
  back: '← Back',
  select: 'Select →',
  schedule: 'Timetable',

  noRoutes: 'No routes yet',
  noRoutesDesc: 'Create your first route to see departures',
  createRoute: 'Create route',
  noSegments: 'No segments',
  noSegmentsDesc: 'Add departures to get started',
  add: 'Add',

  updateAvailable: 'New version available!',
  reload: 'Reload',

  attribution: 'Transit data via',
};

export const translations = { sv, en };
export type Translations = typeof sv;

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'sv';
  return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}
