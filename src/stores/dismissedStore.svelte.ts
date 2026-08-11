/**
 * Persisted set of dismissed deviation IDs/messages.
 * Station notices and departure-card deviation strips can be dismissed
 * by the user. Dismissed items are stored in localStorage and survive
 * page reloads. They are NOT cleared automatically — once dismissed,
 * the user won't see that message again until they clear storage manually
 * or the message ID changes upstream.
 */

const STORAGE_KEY = "nasta-dismissed-deviations";

type Subscriber = (ids: Set<string>) => void;
let _subscribers: Subscriber[] = [];

let _dismissed = $state<Set<string>>(loadDismissed());

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
    return new Set();
  } catch {
    return new Set();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([..._dismissed]));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function notify() {
  for (const fn of _subscribers) fn(_dismissed);
}

function subscribe(fn: Subscriber): () => void {
  fn(_dismissed);
  _subscribers.push(fn);
  return () => {
    _subscribers = _subscribers.filter((s) => s !== fn);
  };
}

/** Dismiss by deviation ID (from stop_deviations) or by message text hash. */
function dismiss(key: string): void {
  if (_dismissed.has(key)) return;
  // Need to trigger reactivity
  _dismissed = new Set([..._dismissed, key]);
  persist();
  notify();
}

function isDismissed(key: string): boolean {
  return _dismissed.has(key);
}

/** Generate a stable key from a message text for dismissal.
 *  Uses simple hash to avoid localStorage bloat. */
function messageKey(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `msg:${hash}`;
}

/** Dismiss by message text (for deviations without stable IDs). */
function dismissMessage(text: string): void {
  dismiss(messageKey(text));
}

function isMessageDismissed(text: string): boolean {
  return isDismissed(messageKey(text));
}

function clear(): void {
  _dismissed = new Set();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
  notify();
}

export const dismissedStore = {
  subscribe,
  dismiss,
  isDismissed,
  dismissMessage,
  isMessageDismissed,
  clear,
};
