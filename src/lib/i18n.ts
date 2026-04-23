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
  language: 'Språk',
  languageAuto: 'Automatiskt',
  languageSwedish: 'Svenska',
  languageEnglish: 'Engelska',
  transferBuffer: 'Bytestid',
  transferBufferDesc: 'Minuter till nästa segment',
  minutesShort: 'min',

  // SegmentList
  addSegmentHint: 'Lägg till resesegment nedan',
  remove: 'Ta bort',

  // SegmentSearch
  searchPlaceholder: 'Sök hållplats...',
  searching: 'Söker...',
  noStops: 'Inga hållplatser hittades',
  loadingDepartures: 'Laddar avgångar...',
  departures: 'Avgångar',
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

  // Bottom bar / arrival
  realisticArrival: 'Ankomst',
  tightTransfer: 'Tajt byte',
  comfortableTransfer: 'Gott om tid',
  transferWindow: 'Byte om {minutes} min',

  // Departure strip
  vehiclePosition: 'Fordonsposition',
  vehicleAt: 'Fordonet är vid {stop}',
  vehicleAtYourStop: 'Fordonet är vid din hållplats',
  approachingStop: 'På väg mot {stop}',
  stopsAwayOne: '1 hållplats kvar till {stop}',
  stopsAwayMany: '{count} hållplatser kvar till {stop}',
  nowAtStop: 'Nu vid {stop}',
  arrivingAt: 'Ankommer {time}',
  estimated: 'Estimat',
  scheduledEstimateLabel: 'Tidtabellsestimat',
  vehicleAtScheduled: 'Beräknat läge vid {stop}',
  positionUnavailablePrimary: 'Position ej tillgänglig',
  live: 'Live',
  stopLabel: 'Hållplats: {stop}',
  unavailable: 'Ej tillgänglig',
  livePositionUnavailable: 'Live position saknas',

  // Onboarding
  onboardingWelcomeTitle: 'Välkommen till Nästa',
  onboardingWelcomeSubtitle: 'Din smarta resetusselskap i Stockholm',
  onboardingWelcomeDesc: 'Få koll på nästa avgång – snabbt och enkelt.',
  onboardingRoutesTitle: 'Spara dina rutter',
  onboardingRoutesSubtitle: 'Skapa rutt till jobbet och hem',
  onboardingRoutesDesc: 'Lägg till dina vanliga resor och få uppdateringar i realtid.',
  onboardingGlanceTitle: 'Aldrig mer att vänta',
  onboardingGlanceSubtitle: 'Ultra-glanceable design',
  onboardingGlanceDesc: 'Största siffran på skärmen = minuter till nästa avgång. Perfekt för stressade morgnar.',
  skipOnboarding: 'Hoppa över',
  skipOnboardingAria: 'Hoppa över introduktion',
  previous: 'Tillbaka',
  previousAria: 'Föregående',
  next: 'Nästa',
  getStarted: 'Kom igång!',
  getStartedAria: 'Kom igång',

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
  language: 'Language',
  languageAuto: 'Automatic',
  languageSwedish: 'Swedish',
  languageEnglish: 'English',
  transferBuffer: 'Transfer buffer',
  transferBufferDesc: 'Minutes before next segment',
  minutesShort: 'min',

  addSegmentHint: 'Add travel segments below',
  remove: 'Remove',

  searchPlaceholder: 'Search stop...',
  searching: 'Searching...',
  noStops: 'No stops found',
  loadingDepartures: 'Loading departures...',
  departures: 'Departures',
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

  realisticArrival: 'Arrival',
  tightTransfer: 'Tight transfer',
  comfortableTransfer: 'Comfortable',
  transferWindow: '{minutes} min transfer',

  vehiclePosition: 'Vehicle position',
  vehicleAt: 'Vehicle at {stop}',
  vehicleAtYourStop: 'Vehicle is at your stop',
  approachingStop: 'Approaching {stop}',
  stopsAwayOne: '1 stop away from {stop}',
  stopsAwayMany: '{count} stops away from {stop}',
  nowAtStop: 'Now at {stop}',
  arrivingAt: 'Arrives {time}',
  estimated: 'Estimated',
  scheduledEstimateLabel: 'Scheduled estimate',
  vehicleAtScheduled: 'Estimated position at {stop}',
  positionUnavailablePrimary: 'Position unavailable',
  live: 'Live',
  stopLabel: 'Stop: {stop}',
  unavailable: 'Unavailable',
  livePositionUnavailable: 'Live position unavailable',

  onboardingWelcomeTitle: 'Welcome to Nästa',
  onboardingWelcomeSubtitle: 'Your smart Stockholm commute companion',
  onboardingWelcomeDesc: 'See your next departure at a glance, fast and simple.',
  onboardingRoutesTitle: 'Save your routes',
  onboardingRoutesSubtitle: 'Create one route to work and one home',
  onboardingRoutesDesc: 'Add your regular journeys and get real-time updates.',
  onboardingGlanceTitle: 'No more waiting around',
  onboardingGlanceSubtitle: 'Ultra-glanceable design',
  onboardingGlanceDesc: 'The biggest number on screen is minutes until the next departure. Built for rushed mornings.',
  skipOnboarding: 'Skip',
  skipOnboardingAria: 'Skip onboarding',
  previous: 'Back',
  previousAria: 'Previous',
  next: 'Next',
  getStarted: 'Get started!',
  getStartedAria: 'Get started',

  attribution: 'Transit data via',
};

export const translations = { sv, en };
export type Translations = typeof sv;

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}
