// Reactive time-of-day store
// Provides current hour, minute, period label, and formatted time
// Updates every 60 seconds. Used by App.svelte for afterwork venue logic.

type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

interface TimeOfDay {
  hour: number;
  minute: number;
  period: TimePeriod;
  formattedTime: string;
}

let _hour = $state(new Date().getHours());
let _minute = $state(new Date().getMinutes());
let _interval: ReturnType<typeof setInterval> | undefined;

function getPeriod(h: number): TimePeriod {
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 16) return 'afternoon';
  if (h >= 16 && h < 20) return 'evening';
  return 'night';
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function update() {
  const now = new Date();
  _hour = now.getHours();
  _minute = now.getMinutes();
}

export function start() {
  if (_interval) return;
  update();
  _interval = setInterval(update, 60_000);
}

export function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = undefined;
  }
}

export function getTimeOfDay(): TimeOfDay {
  return {
    hour: _hour,
    minute: _minute,
    period: getPeriod(_hour),
    formattedTime: `${pad(_hour)}:${pad(_minute)}`,
  };
}
