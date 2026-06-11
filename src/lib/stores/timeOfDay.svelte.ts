export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';
export type DayType = 'weekday' | 'friday' | 'weekend';
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'unknown';

interface TimeOfDayState {
  hour: number;
  minute: number;
  dayOfWeek: number;
  period: TimePeriod;
  dayType: DayType;
  formattedTime: string;
  formattedDate: string;
  isFriday: boolean;
  isWeekend: boolean;
  weatherCondition: WeatherCondition;
  temperature: number | null;
  onTimeStreak: number;
}

const STORAGE_KEY = 'nasta_on_time_streak';
const STORAGE_DATE_KEY = 'nasta_streak_date';

function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 20) return 'evening';
  return 'night';
}

function getDayType(dayOfWeek: number, isFriday: boolean): DayType {
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend';
  if (isFriday) return 'friday';
  return 'weekday';
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function formatDate(dayOfWeek: number): string {
  const days = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
  return days[dayOfWeek];
}

function getOnTimeStreak(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedDate = localStorage.getItem(STORAGE_DATE_KEY);
    const today = new Date().toDateString();
    if (storedDate !== today) {
      localStorage.setItem(STORAGE_DATE_KEY, today);
      return stored ? parseInt(stored, 10) : 0;
    }
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

function incrementOnTimeStreak(): void {
  try {
    const current = getOnTimeStreak();
    localStorage.setItem(STORAGE_KEY, String(current + 1));
    localStorage.setItem(STORAGE_DATE_KEY, new Date().toDateString());
  } catch {}
}

function createInitialState(): TimeOfDayState {
  const now = new Date();
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    dayOfWeek: now.getDay(),
    period: getTimePeriod(now.getHours()),
    dayType: getDayType(now.getDay(), now.getDay() === 5),
    formattedTime: formatTime(now.getHours(), now.getMinutes()),
    formattedDate: formatDate(now.getDay()),
    isFriday: now.getDay() === 5,
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    weatherCondition: 'unknown',
    temperature: null,
    onTimeStreak: getOnTimeStreak()
  };
}

let _state = $state<TimeOfDayState>(createInitialState());
let _intervalId: ReturnType<typeof setInterval> | null = null;

export function getTimeOfDay(): TimeOfDayState {
  return _state;
}

function updateState() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const dayOfWeek = now.getDay();
  const isFriday = dayOfWeek === 5;
  _state = {
    hour,
    minute,
    dayOfWeek,
    period: getTimePeriod(hour),
    dayType: getDayType(dayOfWeek, isFriday),
    formattedTime: formatTime(hour, minute),
    formattedDate: formatDate(dayOfWeek),
    isFriday,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    weatherCondition: _state.weatherCondition,
    temperature: _state.temperature,
    onTimeStreak: getOnTimeStreak()
  };
}

export function start() {
  updateState();
  _intervalId = setInterval(updateState, 60000);
}

export function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

export function updateWeather(condition: WeatherCondition, temp: number | null) {
  _state = { ..._state, weatherCondition: condition, temperature: temp };
}

export function incrementStreak() {
  incrementOnTimeStreak();
  _state = { ..._state, onTimeStreak: getOnTimeStreak() };
}

function computeQuirkyMessage(state: TimeOfDayState): string {
  const { period, dayType, hour, isFriday, isWeekend } = state;

  if (isWeekend) {
    const weekendMsgs = [
      'Helg! Sover du fortfarande? 😴',
      'Ingen stress idag! 🌴',
      'Börja helgen rätt med en fika ☕',
      'Helg = att lata sig 👍'
    ];
    return weekendMsgs[Math.floor(Math.random() * weekendMsgs.length)];
  }

  if (period === 'morning') {
    const msgs = [
      'God morgon, slöa! ☀️',
      'Godmorgon, legendar! 🌅',
      'Ny dag, samma SL... 😅',
      'Dags för morgonpasset! 🚇',
      'Kaffe + tunnelbana = livet ☕🚇'
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  if (period === 'afternoon') {
    if (isFriday && hour >= 15 && hour <= 17) {
      const fridayMsgs = [
        'Helg på gång, skål! 🍺',
        'Fredagsfika med kollegor? 🥐',
        'Snart är det helg! 🎉'
      ];
      return fridayMsgs[Math.floor(Math.random() * fridayMsgs.length)];
    }
    return 'Håll ut, helgen nästan här! 💪';
  }

  if (period === 'evening') {
    return 'Kvällsresan, du klarar det! 🌙';
  }

  if (period === 'night') {
    const nightMsgs = [
      'Sov gott, imorgon är det värre... 😴',
      'SL väntar, sovmorgon idag? 🛏️',
      'Nattmys med tunnelbanan 🌃',
      'Kvällståg till drömmarna 🚂💤'
    ];
    return nightMsgs[Math.floor(Math.random() * nightMsgs.length)];
  }

  return 'Nästa: snart! 🚇';
}

function computeWeatherEmoji(state: TimeOfDayState): string {
  const hour = state.hour;
  const condition = state.weatherCondition;

  if (condition === 'rain') return '🌧️';
  if (condition === 'snow') return '❄️';
  if (condition === 'cloudy') return '☁️';

  if (hour >= 6 && hour < 10) return '🌅';
  if (hour >= 10 && hour < 18) return '☀️';
  if (hour >= 18 && hour < 20) return '🌇';
  return '🌙';
}

let _quirkyMessage = $derived(computeQuirkyMessage(_state));
let _weatherEmoji = $derived(computeWeatherEmoji(_state));
let _isSunlightMode = $derived(_state.period === 'morning' || _state.period === 'afternoon');

export function getQuirkyMessage(): string {
  return _quirkyMessage;
}

export function getWeatherEmoji(): string {
  return _weatherEmoji;
}

export function getIsSunlightMode(): boolean {
  return _isSunlightMode;
}
