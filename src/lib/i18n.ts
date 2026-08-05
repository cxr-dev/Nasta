export type Locale = "sv" | "en";

const sv = {
  // Page labels
  toWork: "TILL JOBBET",
  home: "HEM",
  swipeHintToWork: "→ dra för att byta sida",
  swipeHintHome: "← dra för att byta sida",

  arriving: "Anländer",
  save: "Spara",
  saveAriaLabel: "Spara ändringar",
  settingsAriaLabel: "Öppna inställningar",

  // PageEditor
  closeEditor: "Stäng redigering",
  editingPage: "Redigera",
  tabPages: "Sidor",
  tabSegments: "Avgångar",
  tabFeatures: "Funktioner",
  tabTheme: "Teman",
  cancel: "Avbryt",
  addSegment: "+ Lägg till",
  switchTo: "Byt till",
  settings: "Inställningar",
  disruptionAlerts: "Störningsvarningar",
  disruptionAlertsDesc: "Visa störningar för dina sparade avgångar",
  disruptionThreshold: "Störningsnivå",
  disruptionThresholdDesc: "Välj hur allvarliga störningar som visas",
  disruptionThresholdInfo: "Alla störningar",
  disruptionThresholdWarning: "Viktiga + kritiska",
  disruptionThresholdCritical: "Endast kritiska",
  disruptionThresholdInfoTitle: "Störningsnivåer — Förklaring",
  disruptionThresholdInfoAria: "Förklaring av störningsnivåer",
  disruptionThresholdInfoDesc:
    "Visar alla störningsmeddelanden oavsett allvarlighetsgrad.",
  disruptionThresholdInfoExample1: "Banarbete Slussen–Gamla stan",
  disruptionThresholdInfoExample2: "Planerat underhåll tunnelbana",
  disruptionThresholdInfoExample3: "Hiss ur drift T-Centralen",
  disruptionThresholdWarningDesc:
    "Visar måttliga till allvarliga störningar som påverkar trafiken.",
  disruptionThresholdWarningExample1: "Signalfel – 10–20 min försening",
  disruptionThresholdWarningExample2: "Fordonsbrist – inställda avgångar",
  disruptionThresholdWarningExample3: "Väderrelaterade förseningar",
  disruptionThresholdCriticalDesc:
    "Visar endast allvarliga störningar med stor påverkan.",
  disruptionThresholdCriticalExample1: "Strömavbrott – hela linjen stängd",
  disruptionThresholdCriticalExample2: "Allvarlig olycka – trafik inställd",
  disruptionThresholdCriticalExample3: "Spårfel – omfattande förseningar",
  disruptionLanguage: "Störningsspråk",
  disruptionLanguageAuto: "Automatiskt",
  theme: "Teman",
  language: "Språk",
  languageAuto: "Automatiskt",
  languageSwedish: "Svenska",
  languageEnglish: "Engelska",
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
  walkingEtaDesc:
    "Visa gångavstånd och ETA till hållplatsen. Frågar om plats när du aktiverar.",
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
  loadError: "Kunde inte ladda. Kontrollera din anslutning.",
  retry: "Försök igen",

  // SegmentList
  addSegmentHint: "Lägg till avgångar nedan",
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
  recentStops: "Senast använda",
  nearby: "Nära dig",
  nearbyVenues: "Närliggande ställen",
  discoverNearby: "Upptäck nära",
  updatedJustNow: "Uppdaterad nyss",
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
  noPages: "Inga sidor ännu",
  noPagesDesc: "Lägg till din första avgång för att komma igång",
  createPage: "Skapa sida",
  noSegments: "Inga avgångar",
  noSegmentsDesc: "Lägg till avgångar för att komma igång",
  add: "Lägg till",
  defaultPageName: "Avgångar",

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
  onboardingPagesTitle: "Spara dina sidor",
  onboardingPagesSubtitle: "Skapa sida till jobbet och hem",
  onboardingPagesDesc:
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
  setupStopTitle: "Sök start-hållplats och linje",
  setupStopDesc: "Välj hållplats och rätt avgång för rutten",
  setupReviewTitle: "Granska och spara",
  setupReviewDesc: "Skapa sidan och duplicera vid behov för retur",
  duplicateReturnPage: "Duplicera som retursida",
  createFirstPage: "Skapa första sida",
  dismissHint: "Stäng",

  // Direction selector
  selectDirection: "Välj riktning",
  setupDirection: "Ruttens riktning",
  confirm: "Bekräfta",

  from: "från",

  // Journey planner
  journeyTo: "Till",
  journeyAddressPlaceholder: "Adress eller hållplats",
  journeyFindRoute: "Hitta resa",
  journeySearching: "Söker...",
  journeyNoRoutes: "Inga resor hittades för denna resa.",
  journeySearchFailed: "Sökningen misslyckades. Försök igen.",
  journeyDirect: "Direkt",
  journeyTransfers: "{n} byte{nPlural}",
  journeyPlatformMiddle: "Mitten",
  journeyPlatformFront: "Främre",
  journeyPlatformBack: "Bakre",

  // No departures
  noDeparturesAvailable: "Inga avgångar hittades",
  sleeping: "Sover",
  nextDeparture: "Nästa avgång",

  // Attribution
  attribution: "Trafikdata via",

  // Location prompt
  locationPromptTitle: "Hitta närliggande hållplatser",
  locationPromptDesc:
    "Vi använder din plats för att automatiskt visa de närmaste hållplaterna och gångavståndet.",
  locationEnableBtn: "Aktivera plats",
  locationSkipBtn: "Kanske senare",

  // Settings extras
  afterworkVenuesDesc: "Visa närliggande barer vid utvald tid.",
  afterworkStartTime: "Afterwork-start",
  afterworkStartTimeDesc: "Välj när på dagen afterwork visas.",
  eventsDesc: "Visa närliggande evenemang när du öppnar en avgång.",
  sortByTime: "Efter tid",
  sortByDistance: "Närmast",
  eventFilterAll: "Alla",
  returnTripNote:
    "Lägg till retursidan manuellt genom att skapa en andra sida.",

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
  sunLabel: "Sol",
  shadeLabel: "Skugga",
  priceLevel: "Prisnivå",
  happyHour: "Happy hour",
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
  disruptionProtest: "Protest",
  disruptionTechnical: "Tekniskt fel",
  disruptionWeather: "Väder",
  sectionDisrupted: "Med störningar",
  sectionStationAlerts: "Station",
  sectionStationNotices: "Stationsinfo",
  stationNoticesToggle: "Stationsinfo",
  groupDisruptedSegments: "Gruppera avgångar med störningar",
  groupDisruptedSegmentsDesc:
    "Visa avgångar med störningar separat, nedanför övriga avgångar.",
  disruptionCriticalShort: "Kritisk",
  showAll: "Visa alla",
  showLess: "Visa mindre",
  showNMore: "+{n} till",

  // Transit labels
  lineLabel: "Linje {line}",

  // Page navigation
  pages: "Sidor",
  pageNavigation: "Sidnavigering",
  previousPage: "Föregående sida",
  nextPage: "Nästa sida",
  swipeHint: "← svep för att byta sida →",

  // Transport filter
  allTransportTypes: "Alla",
  via: "via",

  // Step progress
  stepStop: "Hållplats",
  stepLine: "Linje",
  stepDirection: "Riktning",

  // Journey step progress
  journeyStepOrigin: "Från",
  journeyStepDestination: "Till",
  journeyStepChoose: "Välj resa",

  // Segment search sub-tabs
  tabStop: "Hållplats",
  tabRoute: "Resa",

  // Quirky moment
  showCelebration: "Visa firande",

  // PageEditor UX
  segmentsCount: "{n} avgångar",
  segmentsCountZero: "Inga avgångar",
  addSegmentsCta: "Lägg till avgång",
  pageNoun: "Sida",
  selectAPage: "Välj en sida",
  appSettings: "App-inställningar",
  pageIndicator: "Sida: {name}",

  // Map
  expandMap: "Förstora kartan",
  minimizeMap: "Förminska kartan",
  mapViewerLabel: "Järnvägskarta",
  closeMap: "Stäng karta",

  // Sort & Group
  sortGroupSection: "Sortering & gruppering",
  sortBy: "Sortera efter",
  sortManual: "Manuell",
  sortTime: "Avgångstid",
  sortStation: "Stationsnamn",
  sortLine: "Linjenummer",
  sortTransport: "Transporttyp",
  sortDistance: "Avstånd",
  sortDistanceDisabled: "Aktivera Plats i Inställningar",
  sortMore: "Mer",
  defaultSort: "Standardsortering",
  groupBy: "Gruppera efter",
  groupNone: "Ingen",
  groupDisrupted: "Störningar",
  groupStation: "Station",
  groupTransport: "Transporttyp",
  groupSegmentsDesc: "Visa avgångar i grupper efter station eller transporttyp.",
  groupSleeping: "Gruppera sovande",
  groupSleepingDesc: "Flytta sovande linjer till botten av listan.",
  location: "Plats",
  transportBus: "Bussar",
  transportTrain: "Tåg",
  transportMetro: "Tunnelbana",
  transportTram: "Spårvagn",
  transportBoat: "Färjor",
};

const en: typeof sv = {
  toWork: "TO WORK",
  home: "HOME",
  swipeHintToWork: "→ drag to switch page",
  swipeHintHome: "← drag to switch page",

  arriving: "Arriving",
  save: "Save",
  saveAriaLabel: "Save changes",
  settingsAriaLabel: "Open settings",

  closeEditor: "Close editor",
  editingPage: "Editing",
  tabPages: "Pages",
  tabSegments: "Departures",
  tabFeatures: "Features",
  tabTheme: "Themes",
  cancel: "Cancel",
  addSegment: "+ Add",
  switchTo: "Switch to",
  settings: "Settings",
  disruptionAlerts: "Disruption alerts",
  disruptionAlertsDesc: "Show disruptions for saved departures",
  disruptionThreshold: "Disruption level",
  disruptionThresholdDesc: "Choose how severe disruptions must be to be shown",
  disruptionThresholdInfo: "All disruptions",
  disruptionThresholdWarning: "Important + critical",
  disruptionThresholdCritical: "Critical only",
  disruptionThresholdInfoTitle: "Disruption levels — Explanation",
  disruptionThresholdInfoAria: "Explanation of disruption levels",
  disruptionThresholdInfoDesc:
    "Shows all disruption messages regardless of severity.",
  disruptionThresholdInfoExample1: "Track work Slussen–Gamla stan",
  disruptionThresholdInfoExample2: "Planned maintenance on the metro",
  disruptionThresholdInfoExample3: "Elevator out of service at T-Centralen",
  disruptionThresholdWarningDesc:
    "Shows moderate to severe disruptions affecting traffic.",
  disruptionThresholdWarningExample1: "Signal fault – 10–20 min delays",
  disruptionThresholdWarningExample2: "Vehicle shortage – cancelled departures",
  disruptionThresholdWarningExample3: "Weather-related delays",
  disruptionThresholdCriticalDesc:
    "Shows only severe disruptions with major impact.",
  disruptionThresholdCriticalExample1: "Power outage – entire line closed",
  disruptionThresholdCriticalExample2: "Serious accident – traffic suspended",
  disruptionThresholdCriticalExample3: "Track damage – extensive delays",
  disruptionLanguage: "Disruption language",
  disruptionLanguageAuto: "Automatic",
  theme: "Theme",
  language: "Language",
  languageAuto: "Automatic",
  languageSwedish: "Swedish",
  languageEnglish: "English",
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
  walkingEtaDesc:
    "Show walking distance and ETA to your stop. Asks for location when you turn this on.",
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
  loadError: "Couldn't load. Check your connection.",
  retry: "Retry",

  addSegmentHint: "Add travel departures below",
  remove: "Remove",

  searchPlaceholder: "Search stop...",
  searching: "Searching...",
  noStops: "No stop found",
  loadingDepartures: "Loading departures...",
  departures: "Departures",
  noDepartures: "No departures found",
  failedToFetchDepartures: "Failed to fetch departures",
  someStopsNotFound: "Some stop locations could not be found",
  refreshDepartures: "Refresh departures",
  recentStops: "Recent stops",
  nearby: "Nearby",
  nearbyVenues: "Nearby venues",
  discoverNearby: "Discover nearby",
  updatedJustNow: "Updated just now",
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

  noPages: "No pages yet",
  noPagesDesc: "Add your first departure to get started",
  createPage: "Create page",
  noSegments: "No departures",
  noSegmentsDesc: "Add departures to get started",
  add: "Add",
  defaultPageName: "Departures",

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
  onboardingPagesTitle: "Save your pages",
  onboardingPagesSubtitle: "Create one page for work and one for home",
  onboardingPagesDesc: "Add your regular journeys and get real-time updates.",
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
  setupStopTitle: "Search start stop and line",
  setupStopDesc: "Pick a stop and the matching departure",
  setupReviewTitle: "Review and save",
  setupReviewDesc: "Create the page and optionally duplicate return",
  setupDirection: "Route direction",
  duplicateReturnPage: "Duplicate as return page",
  createFirstPage: "Create first page",
  dismissHint: "Dismiss",

  // Direction selector
  selectDirection: "Select direction",
  confirm: "Confirm",

  from: "from",

  // Journey planner
  journeyTo: "To",
  journeyAddressPlaceholder: "Address or stop",
  journeyFindRoute: "Find route",
  journeySearching: "Searching...",
  journeyNoRoutes: "No routes found for this journey.",
  journeySearchFailed: "Search failed. Try again.",
  journeyDirect: "Direct",
  journeyTransfers: "{n} transfer{nPlural}",
  journeyPlatformMiddle: "Middle",
  journeyPlatformFront: "Front",
  journeyPlatformBack: "Back",

  // No departures
  noDeparturesAvailable: "No departures found",
  sleeping: "Sleeping",
  nextDeparture: "Next departure",

  // Attribution
  attribution: "Transit data via",

  // Location prompt
  locationPromptTitle: "Find nearby stops",
  locationPromptDesc:
    "We use your location to automatically show the nearest stops and walking distance.",
  locationEnableBtn: "Enable location",
  locationSkipBtn: "Maybe later",

  afterworkVenuesDesc: "Show nearby bars at selected time.",
  afterworkStartTime: "Afterwork start",
  afterworkStartTimeDesc: "Choose when during the day afterwork shows.",
  eventsDesc: "Show nearby events when you tap a departure.",
  sortByTime: "By time",
  sortByDistance: "Closest",
  eventFilterAll: "All",
  returnTripNote: "Add the return page manually by creating a second page.",

  errorTitle: "Something went wrong",
  errorDefault: "An unexpected error occurred",
  reloadApp: "Reload app",

  closePanel: "Close panel",
  featureMode: "Feature mode",
  venueFilter: "Venue filter",
  wineLabel: "Wine",
  cocktailLabel: "Cocktail",
  outdoorSeating: "Outdoor seating",
  sunLabel: "Sun",
  shadeLabel: "Shade",
  priceLevel: "Price level",
  happyHour: "Happy hour",
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
  disruptionProtest: "Protest",
  disruptionTechnical: "Technical issue",
  disruptionWeather: "Weather",
  sectionDisrupted: "With disruptions",
  sectionStationAlerts: "Station notices",
  sectionStationNotices: "Station info",
  stationNoticesToggle: "Station info",
  groupDisruptedSegments: "Group disrupted departures",
  groupDisruptedSegmentsDesc:
    "Show disrupted departures separately, below your other departures.",
  disruptionCriticalShort: "Critical",
  showAll: "Show all",
  showLess: "Show less",
  showNMore: "+{n} more",

  lineLabel: "Line {line}",

  // Page navigation
  pages: "Pages",
  pageNavigation: "Page navigation",
  previousPage: "Previous page",
  nextPage: "Next page",
  swipeHint: "← swipe to switch page →",

  // Transport filter
  allTransportTypes: "All",
  via: "via",

  stepStop: "Stop",
  stepLine: "Line",
  stepDirection: "Direction",

  // Journey step progress
  journeyStepOrigin: "From",
  journeyStepDestination: "To",
  journeyStepChoose: "Choose route",

  // Segment search sub-tabs
  tabStop: "Stop",
  tabRoute: "Route",

  showCelebration: "Show celebration",

  // PageEditor UX
  segmentsCount: "{n} departures",
  segmentsCountZero: "No departures",
  addSegmentsCta: "Add departure",
  pageNoun: "Page",
  selectAPage: "Select a page",
  appSettings: "App settings",
  pageIndicator: "Page: {name}",

  // Map
  expandMap: "Expand map fullscreen",
  minimizeMap: "Minimize map",
  mapViewerLabel: "Railway map",
  closeMap: "Close map",

  // Sort & Group
  sortGroupSection: "Sort & group",
  sortBy: "Sort by",
  sortManual: "Manual",
  sortTime: "Departure time",
  sortStation: "Station name",
  sortLine: "Line number",
  sortTransport: "Transport type",
  sortDistance: "Distance",
  sortDistanceDisabled: "Enable Location in Settings",
  sortMore: "More",
  defaultSort: "Default sort",
  groupBy: "Group by",
  groupNone: "None",
  groupDisrupted: "Disrupted only",
  groupStation: "Station",
  groupTransport: "Transport type",
  groupSegmentsDesc: "Show departures grouped by station or transport type.",
  groupSleeping: "Group sleeping",
  groupSleepingDesc: "Move sleeping lines to the bottom of the list.",
  location: "Location",
  transportBus: "Buses",
  transportTrain: "Trains",
  transportMetro: "Metro",
  transportTram: "Trams",
  transportBoat: "Ferries",
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
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
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
