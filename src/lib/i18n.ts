export type Locale = "sv" | "en";

const sv = {
  // Route labels
  toWork: "TILL JOBBET",
  home: "HEM",
  swipeHintToWork: "→ dra för att byta rutt",
  swipeHintHome: "← dra för att byta rutt",

  // BottomBar
  arriving: "Anländer",
  save: "Spara",
  saveAriaLabel: "Spara ändringar",
  settingsAriaLabel: "Öppna inställningar",

  // RouteEditor
  closeEditor: "Stäng redigering",
  editingRoute: "Redigera",
  cancel: "Avbryt",
  addSegment: "+ Lägg till segment",
  switchTo: "Byt till",
  settings: "Inställningar",
  showNotifications: "Visa notiser",
  notificationsDesc: "Roliga meddelanden baserade på tid och väder",
  disruptionAlerts: "Störningsvarningar",
  disruptionAlertsDesc: "Visa störningar för dina sparade segment",
  disruptionThreshold: "Störningsnivå",
  disruptionThresholdDesc: "Välj hur allvarliga störningar som visas",
  disruptionThresholdInfo: "Alla störningar",
  disruptionThresholdWarning: "Viktiga + kritiska",
  disruptionThresholdCritical: "Endast kritiska",
  disruptionLanguage: "Störningsspråk",
  disruptionLanguageAuto: "Automatiskt",
  theme: "Tema",
  language: "Språk",
  languageAuto: "Automatiskt",
  languageSwedish: "Svenska",
  languageEnglish: "Engelska",
  transferBuffer: "Bytestid",
  transferBufferDesc: "Minuter till nästa segment",
  minutesShort: "min",
  planned: "Planerad",
  morningFirst: "Morgonens första",
  transportModes: "Transportmedel",
  transportModesDesc: "Visa endast dessa i sökning",
  openInMaps: "Visa på karta",
  chooseMapApp: "Välj kart-app",
  rememberMapChoice: "Kom ihåg mitt val",
  locationServices: "Platsjänster",
  locationServicesDesc: "Aktivera plats i webbläsaren för gång-ETA.",
  walkingEta: "Gång-ETA",
  walkingEtaDesc: "Visa gångavstånd och ETA till hållplatsen. Frågar om plats när du aktiverar.",
  walkingEtaLockedDesc: "Aktivera för att använda gång-ETA.",
  enableLocationForWalkEta: "Aktivera plats för gång-ETA.",
  enableLocationForWalkEtaBrowser:
    "Tillåt platsåtkomst i webbläsaren för gång-ETA.",
  waitingForLocation: "Hämtar position...",
  departing: "Avgår",
  afterwork: "Afterwork",
  events: "Evenemang",
  swipeCards: "Svep horisontellt",
  browseNearby: "Bläddra bland närliggande",
  noVenuesFound: "Inga afterwork-ställen hittades",
  noEventsFound: "Inga evenemang hittades",
  openTickets: "Biljetter",
  walkToStop: "Gå till hållplats",
  beer: "Öl",
  wineCocktails: "Vin & cocktails",
  dataMayBeStale: "Data kan vara gammal",
  updated: "Uppdaterad",
  loading: "Laddar",
  autoRefresh: "Auto-uppdatering på",

  // SegmentList
  addSegmentHint: "Lägg till resesegment nedan",
  remove: "Ta bort",

  // SegmentSearch
  searchPlaceholder: "Sök hållplats...",
  searching: "Söker...",
  noStops: "Inga hållplatser hittades",
  loadingDepartures: "Laddar avgångar...",
  departures: "Avgångar",
  noDepartures: "Inga avgångar hittades",
  failedToFetchDepartures: "Kunde inte hämta avgångar",
  someStopsNotFound: "Vissa hållplatser kunde inte hittas",
  refreshDepartures: "Uppdatera avgångar",
  nearby: "Nära dig",
  nearbyVenues: "Närliggande ställen",
  updatedMinutesAgo: "Uppdaterad för {minutes} min sedan",
  staleDataNotice: "Trafikdata är gammal, dra nedåt för att uppdatera",
  confidenceLive: "Live",
  confidenceCached: "Cache",
  confidencePredicted: "Tidtabell",
  confidenceStale: "Gammal",
  disruptions: "Störningar",
  disruptionCritical: "Kritisk störning",
  disruptionAffected: "Påverkad",
  disruptionNone: "Ingen aktiv störning",
  usingCachedDisruptions: "Visar cachad störningsinformation",
  noDisruptionDetails: "Inga detaljer tillgängliga",
  back: "← Tillbaka",
  select: "Välj →",
  schedule: "Tidtabell",

  // App empty states
  noRoutes: "Inga rutter ännu",
  noRoutesDesc: "Skapa din första rutt för att se avgångar",
  createRoute: "Skapa rutt",
  noSegments: "Inga segment",
  noSegmentsDesc: "Lägg till avgångar för att komma igång",
  add: "Lägg till",

  // Update banner
  updateAvailable: "Ny version tillgänglig!",
  reload: "Ladda om",

  // Departure strip
  vehiclePosition: "Fordonsposition",
  vehicleAt: "Fordonet är vid {stop}",
  vehicleAtYourStop: "Fordonet är vid din hållplats",
  approachingStop: "På väg mot {stop}",
  stopsAwayOne: "1 hållplats kvar till {stop}",
  stopsAwayMany: "{count} hållplatser kvar till {stop}",
  nowAtStop: "Nu vid {stop}",
  arrivingAt: "Ankommer {time}",
  estimated: "Estimat",
  scheduledEstimateLabel: "Tidtabellsestimat",
  vehicleAtScheduled: "Beräknat läge vid {stop}",
  positionUnavailablePrimary: "",
  live: "Live",
  stopLabel: "Hållplats: {stop}",
  unavailable: "Ej tillgänglig",
  livePositionUnavailable: "",
  estimatedPosition: "Ungefärligt läge",

  // Onboarding
  onboardingWelcomeTitle: "Välkommen till Nästa",
  onboardingWelcomeSubtitle: "Din smarta resetusselskap i Stockholm",
  onboardingWelcomeDesc: "Få koll på nästa avgång – snabbt och enkelt.",
  onboardingRoutesTitle: "Spara dina rutter",
  onboardingRoutesSubtitle: "Skapa rutt till jobbet och hem",
  onboardingRoutesDesc:
    "Lägg till dina vanliga resor och få uppdateringar i realtid.",
  onboardingGlanceTitle: "Aldrig mer att vänta",
  onboardingGlanceSubtitle: "Ultra-glanceable design",
  onboardingGlanceDesc:
    "Största siffran på skärmen = minuter till nästa avgång. Perfekt för stressade morgnar.",
  skipOnboarding: "Hoppa över",
  skipOnboardingAria: "Hoppa över introduktion",
  previous: "Tillbaka",
  previousAria: "Föregående",
  next: "Nästa",
  getStarted: "Kom igång!",
  getStartedAria: "Kom igång",
  setupDirectionTitle: "Vilken väg ska vi ställa in först?",
  setupDirectionDesc: "Välj riktning för din första dagliga rutt",
  setupDirectionToWork: "Till jobbet",
  setupDirectionFromWork: "Hem från jobbet",
  setupStopTitle: "Sök start-hållplats och linje",
  setupStopDesc: "Välj hållplats och rätt avgång för rutten",
  setupReviewTitle: "Granska och spara",
  setupReviewDesc: "Skapa rutten och duplicera vid behov för retur",
  duplicateReturnRoute: "Duplicera som returrutt",
  createFirstRoute: "Skapa första rutt",
  onboardingHint: "Lägg till segment i Inställningar.",
  onboardingHintNew: "NYTT",
  onboardingHintText: "Klicka här för att lägga till ditt första segment!",
  dismissHint: "Stäng",

  // Direction selector
  selectDirection: "Välj riktning",
  confirm: "Bekräfta",

  from: "från",

  // No departures
  noDeparturesAvailable: "Inga avgångar hittades",

  // Attribution
  attribution: "Trafikdata via",

  // Location prompt
  locationPromptTitle: "Hitta närliggande hållplatser",
  locationPromptDesc:
    "Vi använder din plats för att automatiskt visa de närmaste hållplaterna och gångavståndet.",
  locationEnableBtn: "Aktivera plats",
  locationSkipBtn: "Kanske senare",

  // Settings extras
  afterworkVenuesDesc: "Visa närliggande barer efter kl. 15:00.",
  eventsDesc: "Visa närliggande evenemang när du trycker på ett segment.",
  returnTripNote:
    "Lägg till returrutten manuellt genom att skapa en andra rutt.",

  // Error boundary
  errorTitle: "Något gick fel",
  errorDefault: "Ett oväntat fel inträffade",
  reloadApp: "Ladda om appen",

  // Feature discovery
  closePanel: "Stäng panel",
  featureMode: "Funktionsläge",
  venueFilter: "Filtrera ställen",
  wineLabel: "Vin",
  cocktailLabel: "Cocktail",
  outdoorSeating: "Uteservering",
  priceLevel: "Prisnivå",
  defaultCity: "Stockholm",
  today: "Idag",
  tomorrow: "Imorgon",
  allDay: "Heldag",
  atTime: "kl. {time}",
  openNow: "Öppet nu",
  closed: "Stängt",
  closesAt: "stänger {time}",
  opensAt: "öppnar {time}",
  emDash: "—",

  // Disruption types
  disruptionGeneral: "Störning",

  // Transit labels
  lineLabel: "Linje {line}",

  // Quirky moment
  showCelebration: "Visa firande",
};

const en: typeof sv = {
  toWork: "TO WORK",
  home: "HOME",
  swipeHintToWork: "→ drag to switch route",
  swipeHintHome: "← drag to switch route",

  arriving: "Arriving",
  save: "Save",
  saveAriaLabel: "Save changes",
  settingsAriaLabel: "Open settings",

  closeEditor: "Close editor",
  editingRoute: "Editing",
  cancel: "Cancel",
  addSegment: "+ Add segment",
  switchTo: "Switch to",
  settings: "Settings",
  showNotifications: "Show notifications",
  notificationsDesc: "Fun messages based on time and weather",
  disruptionAlerts: "Disruption alerts",
  disruptionAlertsDesc: "Show disruptions for saved segments",
  disruptionThreshold: "Disruption level",
  disruptionThresholdDesc: "Choose how severe disruptions must be to be shown",
  disruptionThresholdInfo: "All disruptions",
  disruptionThresholdWarning: "Important + critical",
  disruptionThresholdCritical: "Critical only",
  disruptionLanguage: "Disruption language",
  disruptionLanguageAuto: "Automatic",
  theme: "Theme",
  language: "Language",
  languageAuto: "Automatic",
  languageSwedish: "Swedish",
  languageEnglish: "English",
  transferBuffer: "Transfer buffer",
  transferBufferDesc: "Minutes before next segment",
  minutesShort: "min",
  planned: "Planned",
  morningFirst: "Morning first",
  transportModes: "Transport modes",
  transportModesDesc: "Only show these in search",
  openInMaps: "Open in Maps",
  chooseMapApp: "Choose map app",
  rememberMapChoice: "Remember my choice",
  locationServices: "Location services",
  locationServicesDesc: "Enable browser location for walking ETA.",
  walkingEta: "Walking ETA",
  walkingEtaDesc: "Show walking distance and ETA to your stop. Asks for location when you turn this on.",
  walkingEtaLockedDesc: "Enable to use walking ETA.",
  enableLocationForWalkEta: "Enable location for live walk ETA.",
  enableLocationForWalkEtaBrowser:
    "Allow location in the browser for walking ETA.",
  waitingForLocation: "Fetching location...",
  departing: "Departing",
  afterwork: "Afterwork",
  events: "Events",
  swipeCards: "Swipe horizontally",
  browseNearby: "Browse nearby",
  noVenuesFound: "No venues found",
  noEventsFound: "No events found",
  openTickets: "Tickets",
  walkToStop: "Walk to stop",
  beer: "Beer",
  wineCocktails: "Wine + cocktails",
  dataMayBeStale: "Data may be stale",
  updated: "Updated",
  loading: "Loading",
  autoRefresh: "Auto-refresh on",

  addSegmentHint: "Add travel segments below",
  remove: "Remove",

  searchPlaceholder: "Search stop...",
  searching: "Searching...",
  noStops: "No stops found",
  loadingDepartures: "Loading departures...",
  departures: "Departures",
  noDepartures: "No departures found",
  failedToFetchDepartures: "Failed to fetch departures",
  someStopsNotFound: "Some stop locations could not be found",
  refreshDepartures: "Refresh departures",
  nearby: "Nearby",
  nearbyVenues: "Nearby venues",
  updatedMinutesAgo: "Updated {minutes} min ago",
  staleDataNotice: "Transit data is stale, pull to refresh",
  confidenceLive: "Live",
  confidenceCached: "Cached",
  confidencePredicted: "Predicted",
  confidenceStale: "Stale",
  disruptions: "Disruptions",
  disruptionCritical: "Critical disruption",
  disruptionAffected: "Affected",
  disruptionNone: "No active disruption",
  usingCachedDisruptions: "Showing cached disruption data",
  noDisruptionDetails: "No details available",
  back: "← Back",
  select: "Select →",
  schedule: "Timetable",

  noRoutes: "No routes yet",
  noRoutesDesc: "Create your first route to see departures",
  createRoute: "Create route",
  noSegments: "No segments",
  noSegmentsDesc: "Add departures to get started",
  add: "Add",

  updateAvailable: "New version available!",
  reload: "Reload",

  vehiclePosition: "Vehicle position",
  vehicleAt: "Vehicle at {stop}",
  vehicleAtYourStop: "Vehicle is at your stop",
  approachingStop: "Approaching {stop}",
  stopsAwayOne: "1 stop away from {stop}",
  stopsAwayMany: "{count} stops away from {stop}",
  nowAtStop: "Now at {stop}",
  arrivingAt: "Arrives {time}",
  estimated: "Estimated",
  scheduledEstimateLabel: "Scheduled estimate",
  vehicleAtScheduled: "Estimated position at {stop}",
  positionUnavailablePrimary: "",
  live: "Live",
  stopLabel: "Stop: {stop}",
  unavailable: "Unavailable",
  livePositionUnavailable: "",
  estimatedPosition: "Estimated position",

  onboardingWelcomeTitle: "Welcome to Nästa",
  onboardingWelcomeSubtitle: "Your smart Stockholm commute companion",
  onboardingWelcomeDesc:
    "See your next departure at a glance, fast and simple.",
  onboardingRoutesTitle: "Save your routes",
  onboardingRoutesSubtitle: "Create one route to work and one home",
  onboardingRoutesDesc: "Add your regular journeys and get real-time updates.",
  onboardingGlanceTitle: "No more waiting around",
  onboardingGlanceSubtitle: "Ultra-glanceable design",
  onboardingGlanceDesc:
    "The biggest number on screen is minutes until the next departure. Built for rushed mornings.",
  skipOnboarding: "Skip",
  skipOnboardingAria: "Skip onboarding",
  previous: "Back",
  previousAria: "Previous",
  next: "Next",
  getStarted: "Get started!",
  getStartedAria: "Get started",
  setupDirectionTitle: "Which direction should we set up first?",
  setupDirectionDesc: "Choose direction for your first daily route",
  setupDirectionToWork: "To work",
  setupDirectionFromWork: "Home from work",
  setupStopTitle: "Search start stop and line",
  setupStopDesc: "Pick a stop and the matching departure",
  setupReviewTitle: "Review and save",
  setupReviewDesc: "Create the route and optionally duplicate return",
  duplicateReturnRoute: "Duplicate as return route",
  createFirstRoute: "Create first route",
  onboardingHint: "Add segments from Settings.",
  onboardingHintNew: "NEW",
  onboardingHintText: "Click here to add your first segment!",
  dismissHint: "Dismiss",

  // Direction selector
  selectDirection: "Select direction",
  confirm: "Confirm",

  from: "from",

  // No departures
  noDeparturesAvailable: "No departures found",

  // Attribution
  attribution: "Transit data via",

  // Location prompt
  locationPromptTitle: "Find nearby stops",
  locationPromptDesc:
    "We use your location to automatically show the nearest stops and walking distance.",
  locationEnableBtn: "Enable location",
  locationSkipBtn: "Maybe later",

  afterworkVenuesDesc: "Show nearby bars after 15:00.",
  eventsDesc: "Show nearby events when you tap a segment.",
  returnTripNote: "Add the return route manually by creating a second route.",

  errorTitle: "Something went wrong",
  errorDefault: "An unexpected error occurred",
  reloadApp: "Reload app",

  closePanel: "Close panel",
  featureMode: "Feature mode",
  venueFilter: "Venue filter",
  wineLabel: "Wine",
  cocktailLabel: "Cocktail",
  outdoorSeating: "Outdoor seating",
  priceLevel: "Price level",
  defaultCity: "Stockholm",
  today: "Today",
  tomorrow: "Tomorrow",
  allDay: "All day",
  atTime: "at {time}",
  openNow: "Open now",
  closed: "Closed",
  closesAt: "closes {time}",
  opensAt: "opens {time}",
  emDash: "—",

  disruptionGeneral: "Disruption",

  lineLabel: "Line {line}",

  showCelebration: "Show celebration",
};

export const translations = { sv, en };
export type Translations = typeof sv;

const STOCKHOLM_TZ = "Europe/Stockholm";

export function getIntlLocale(locale: Locale): string {
  return locale === "sv" ? "sv-SE" : "en-GB";
}

function getStockholmDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: STOCKHOLM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: parseInt(getPart("year"), 10),
    month: parseInt(getPart("month"), 10) - 1,
    day: parseInt(getPart("day"), 10),
    hour: parseInt(getPart("hour"), 10),
    minute: parseInt(getPart("minute"), 10),
  };
}

function getStockholmDayDifference(date1: Date, date2: Date): number {
  const p1 = getStockholmDateParts(date1);
  const p2 = getStockholmDateParts(date2);
  const d1 = new Date(Date.UTC(p1.year, p1.month, p1.day));
  const d2 = new Date(Date.UTC(p2.year, p2.month, p2.day));
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatStockholmTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    timeZone: STOCKHOLM_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatEventDateTime(
  startTimeStr: string | undefined,
  locale: Locale,
  strings: Translations,
): string {
  if (!startTimeStr) return strings.emDash;
  const date = new Date(startTimeStr);
  if (Number.isNaN(date.getTime())) return startTimeStr;

  const parts = getStockholmDateParts(date);
  const dayDiff = getStockholmDayDifference(date, new Date());
  const isDateOnly =
    /^\d{4}-\d{2}-\d{2}$/.test(startTimeStr) ||
    /T00:00:00/.test(startTimeStr) ||
    (startTimeStr.includes("00:00:00") &&
      (parts.hour === 1 || parts.hour === 2 || parts.hour === 0));

  const pad = (n: number) => String(n).padStart(2, "0");
  const timeText = isDateOnly
    ? ` (${strings.allDay})`
    : ` ${strings.atTime.replace("{time}", `${pad(parts.hour)}:${pad(parts.minute)}`)}`;

  if (dayDiff === 0) return `${strings.today}${timeText}`;
  if (dayDiff === 1) return `${strings.tomorrow}${timeText}`;

  const intlLocale = getIntlLocale(locale);
  const weekday = new Intl.DateTimeFormat(intlLocale, {
    timeZone: STOCKHOLM_TZ,
    weekday: "long",
  }).format(date);
  const dayAndMonth = new Intl.DateTimeFormat(intlLocale, {
    timeZone: STOCKHOLM_TZ,
    day: "numeric",
    month: "short",
  }).format(date);
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalizedWeekday} ${dayAndMonth}${timeText}`;
}

export function formatEventRelativeShort(
  startTimeStr: string | undefined,
  locale: Locale,
  strings: Translations,
): string {
  if (!startTimeStr) return strings.emDash;
  const date = new Date(startTimeStr);
  if (Number.isNaN(date.getTime())) return strings.emDash;

  const dayDiff = getStockholmDayDifference(date, new Date());
  if (dayDiff === 0) return strings.today;
  if (dayDiff === 1) return strings.tomorrow;

  const intlLocale = getIntlLocale(locale);
  const weekday = new Intl.DateTimeFormat(intlLocale, {
    timeZone: STOCKHOLM_TZ,
    weekday: "short",
  }).format(date);
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const day = new Intl.DateTimeFormat(intlLocale, {
    timeZone: STOCKHOLM_TZ,
    day: "numeric",
  }).format(date);
  return `${capitalizedWeekday} ${day}`;
}

export function formatVenueOpenStatus(
  isOpenNow: boolean,
  nextChangeText: string,
  strings: Translations,
): string {
  if (isOpenNow) {
    return nextChangeText
      ? `${strings.openNow} · ${strings.closesAt.replace("{time}", nextChangeText)}`
      : strings.openNow;
  }
  return nextChangeText
    ? `${strings.closed} · ${strings.opensAt.replace("{time}", nextChangeText)}`
    : strings.closed;
}

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("sv") ? "sv" : "en";
}
