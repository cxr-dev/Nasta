import { writable, derived } from 'svelte/store';

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';
export type DayType = 'weekday' | 'friday' | 'weekend';

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
}

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

function createTimeOfDayStore() {
  const now = new Date();
  const initial: TimeOfDayState = {
    hour: now.getHours(),
    minute: now.getMinutes(),
    dayOfWeek: now.getDay(),
    period: getTimePeriod(now.getHours()),
    dayType: getDayType(now.getDay(), now.getDay() === 5),
    formattedTime: formatTime(now.getHours(), now.getMinutes()),
    formattedDate: formatDate(now.getDay()),
    isFriday: now.getDay() === 5,
    isWeekend: now.getDay() === 0 || now.getDay() === 6
  };

  const { subscribe, set } = writable<TimeOfDayState>(initial);

  let intervalId: ReturnType<typeof setInterval> | null = null;

  function update() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay();
    const isFriday = dayOfWeek === 5;

    set({
      hour,
      minute,
      dayOfWeek,
      period: getTimePeriod(hour),
      dayType: getDayType(dayOfWeek, isFriday),
      formattedTime: formatTime(hour, minute),
      formattedDate: formatDate(dayOfWeek),
      isFriday,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6
    });
  }

  function start() {
    update();
    intervalId = setInterval(update, 60000);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    subscribe,
    start,
    stop,
    update
  };
}

export const timeOfDay = createTimeOfDayStore();

export const quirkyMessage = derived(timeOfDay, ($time) => {
  const { period, dayType, hour, isFriday } = $time;

  if (period === 'morning') {
    const msgs = [
      'God morgon, slöa! ☀️',
      'Godmorgon, legendar! 🌅',
      'Ny dag, samma SL... 😅',
      'Dags för morgonpasset! 🚇'
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  if (period === 'afternoon') {
    return 'Håll ut, helgen nästan här! 💪';
  }

  if (period === 'evening') {
    if (isFriday && hour >= 15 && hour <= 17) {
      return 'Helg på gång, skål! 🍺';
    }
    return 'Kvällsresan, du klarar det! 🌙';
  }

  if (period === 'night') {
    const msgs = [
      'Sov gott, imorgon är det värre... 😴',
      'SL väntar, sovmorgon idag? 🛏️',
      'Nattmys med tunnelbanan 🌃'
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  return 'Nästa: snart! 🚇';
});

export const weatherIcon = derived(timeOfDay, ($time) => {
  const hour = $time.hour;
  if (hour >= 6 && hour < 10) return '🌅';
  if (hour >= 10 && hour < 18) return '☀️';
  if (hour >= 18 && hour < 20) return '🌇';
  return '🌙';
});
