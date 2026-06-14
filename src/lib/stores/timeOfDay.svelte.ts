export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

interface TimeOfDayState {
  hour: number;
  minute: number;
  period: TimePeriod;
  formattedTime: string;
}

function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 20) return 'evening';
  return 'night';
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function createInitialState(): TimeOfDayState {
  const now = new Date();
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    period: getTimePeriod(now.getHours()),
    formattedTime: formatTime(now.getHours(), now.getMinutes()),
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
  _state = {
    hour,
    minute,
    period: getTimePeriod(hour),
    formattedTime: formatTime(hour, minute),
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
