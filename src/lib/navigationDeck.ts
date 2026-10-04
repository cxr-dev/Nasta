import type { DeckDestination } from './deckNavigation';
import { deckDestinationIndex } from './deckNavigation';
import { clampPageSwipeVelocity } from './pageSwipe';
import { createMotionSpring, type FrameClock } from './motionSpring';

export type { FrameClock } from './motionSpring';

export type DeckFrame = {
  position: number;
  moving: boolean;
  committed: DeckDestination;
};

export type DeckCommit = {
  from: DeckDestination;
  to: DeckDestination;
  historyMode: 'auto' | 'none' | 'replace';
};

type HistoryMode = DeckCommit['historyMode'];
type Pending = { destination: DeckDestination; historyMode: HistoryMode; source: DeckDestination };
type PointerSample = { x: number; time: number };

function sameDestination(left: DeckDestination, right: DeckDestination): boolean {
  return deckDestinationIndex([left], right) === 0;
}

function resisted(value: number, min: number, max: number, width: number): number {
  if (value >= min && value <= max) return value;
  const boundary = value < min ? min : max;
  const overrun = Math.abs(value - boundary);
  const distance = Math.max(1, width);
  const reduced = distance * (1 - 1 / (overrun * 0.55 / distance + 1));
  return boundary + Math.sign(value - boundary) * reduced;
}

export function createNavigationDeck(options: {
  destinations: DeckDestination[];
  initial: DeckDestination;
  width: number;
  clock: FrameClock;
  onFrame(frame: DeckFrame): void;
  onCommit(commit: DeckCommit): void;
}): {
  read(): DeckFrame;
  update(destinations: DeckDestination[], width: number): void;
  beginDrag(clientX: number): void;
  drag(clientX: number, time: number): void;
  release(time: number): void;
  cancelDrag(): void;
  resumeInterrupted(): void;
  goTo(destination: DeckDestination, historyMode?: HistoryMode): void;
  by(direction: -1 | 1): void;
  setReducedMotion(reduce: boolean): void;
  destroy(): void;
} {
  let destinations = [...options.destinations];
  let width = Math.max(1, options.width);
  let committed = destinations[deckDestinationIndex(destinations, options.initial)] ?? destinations[0] ?? options.initial;
  let pending: Pending | null = null;
  let dragging = false;
  let dragMoved = false;
  let pointerOrigin = 0;
  let grabbedPosition = deckDestinationIndex(destinations, committed) * width;
  let pointerSamples: PointerSample[] = [];
  let reducedMotion = false;
  let destroyed = false;

  const spring = createMotionSpring({
    clock: options.clock,
    initial: grabbedPosition,
    onFrame() { emit(); },
    onRest() { settle(); },
  });

  function committedIndex(): number {
    return Math.max(0, deckDestinationIndex(destinations, committed));
  }

  function frame(): DeckFrame {
    return {
      position: spring.read().position / width,
      moving: dragging || pending !== null,
      committed,
    };
  }

  function emit(): void {
    if (!destroyed) options.onFrame(frame());
  }

  function targetIndex(destination: DeckDestination): number {
    return deckDestinationIndex(destinations, destination);
  }

  function settle(): void {
    if (destroyed || !pending) {
      emit();
      return;
    }
    const completed = pending;
    pending = null;
    const changed = !sameDestination(completed.source, completed.destination);
    committed = completed.destination;
    emit();
    if (changed) options.onCommit({ from: completed.source, to: completed.destination, historyMode: completed.historyMode });
  }

  function recentVelocity(time: number): number {
    const samples = [...pointerSamples, { x: pointerSamples.at(-1)?.x ?? 0, time }];
    const last = samples.at(-1)!;
    const first = samples.find((sample) => sample.time >= last.time - 80) ?? last;
    const elapsed = last.time - first.time;
    return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
  }

  function startSettle(destination: DeckDestination, historyMode: HistoryMode, velocity = 0): void {
    const source = committed;
    pending = { destination, historyMode, source };
    const index = targetIndex(destination);
    if (index < 0) {
      pending = null;
      return;
    }
    if (reducedMotion) {
      spring.jump(index * width);
      settle();
      return;
    }
    spring.retarget(index * width, velocity);
    emit();
  }

  function nearestAllowed(projected: number, source: number): number {
    return Math.max(Math.max(0, source - 1), Math.min(Math.min(destinations.length - 1, source + 1), Math.round(projected / width)));
  }

  return {
    read: frame,
    update(nextDestinations, nextWidth) {
      if (destroyed || nextDestinations.length === 0) return;
      const oldWidth = width;
      const normalized = spring.read().position / oldWidth;
      const oldIndex = committedIndex();
      const preserved = nextDestinations[deckDestinationIndex(nextDestinations, committed)]
        ?? nextDestinations[Math.min(oldIndex, nextDestinations.length - 1)];
      const listChanged = nextDestinations.length !== destinations.length
        || nextDestinations.some((destination, index) => !sameDestination(destination, destinations[index] ?? destination));
      const preservedPending = pending && nextDestinations[deckDestinationIndex(nextDestinations, pending.destination)];
      const preservedSource = pending && nextDestinations[deckDestinationIndex(nextDestinations, pending.source)];
      destinations = [...nextDestinations];
      width = Math.max(1, nextWidth);
      committed = preserved;
      grabbedPosition = grabbedPosition / oldWidth * width;
      pending = preservedPending && pending
        ? { ...pending, destination: preservedPending, source: preservedSource ?? committed }
        : null;
      spring.jump(listChanged && !pending ? committedIndex() * width : normalized * width);
      if (pending) {
        spring.retarget(targetIndex(pending.destination) * width);
      }
      emit();
    },
    beginDrag(clientX) {
      if (destroyed) return;
      grabbedPosition = spring.pause().position;
      pointerOrigin = clientX;
      pointerSamples = [{ x: 0, time: options.clock.now() }];
      dragging = true;
      dragMoved = false;
      emit();
    },
    drag(clientX, time) {
      if (destroyed || !dragging) return;
      const delta = clientX - pointerOrigin;
      pointerSamples.push({ x: delta, time });
      if (pointerSamples.length > 8) pointerSamples.shift();
      dragMoved ||= delta !== 0;
      const max = Math.max(0, (destinations.length - 1) * width);
      spring.jump(resisted(grabbedPosition - delta, 0, max, width));
      emit();
    },
    release(time) {
      if (destroyed || !dragging) return;
      dragging = false;
      if (!dragMoved) {
        this.resumeInterrupted();
        return;
      }
      const source = committedIndex();
      const position = spring.read().position;
      const velocity = clampPageSwipeVelocity(recentVelocity(time));
      const displacement = position - source * width;
      const target = Math.abs(velocity) < 0.1
        ? (Math.abs(displacement) >= width * 0.33 ? source + Math.sign(displacement) : source)
        : nearestAllowed(position - velocity * 180, source);
      const bounded = Math.max(0, Math.min(destinations.length - 1, target));
      startSettle(destinations[bounded], 'auto', -velocity);
    },
    cancelDrag() {
      if (destroyed || !dragging) return;
      dragging = false;
      startSettle(committed, 'auto');
    },
    resumeInterrupted() {
      if (destroyed) return;
      dragging = false;
      if (pending) {
        const target = targetIndex(pending.destination);
        if (target >= 0) spring.retarget(target * width);
      } else {
        spring.retarget(committedIndex() * width);
      }
      emit();
    },
    goTo(destination, historyMode = 'auto') {
      if (destroyed) return;
      const index = targetIndex(destination);
      if (index < 0) return;
      const source = committed;
      if (sameDestination(destination, committed) && !pending) return;
      const distance = Math.abs(index - committedIndex());
      if (distance > 1) {
        spring.jump(index * width);
        pending = null;
        committed = destination;
        emit();
        options.onCommit({ from: source, to: destination, historyMode });
        return;
      }
      startSettle(destination, historyMode);
    },
    by(direction) {
      if (destroyed) return;
      const base = pending ? targetIndex(pending.destination) : committedIndex();
      const destination = destinations[base + direction];
      if (destination) this.goTo(destination);
    },
    setReducedMotion(reduce) {
      reducedMotion = reduce;
      if (!reduce || !pending) return;
      const index = targetIndex(pending.destination);
      if (index < 0) return;
      spring.jump(index * width);
      settle();
    },
    destroy() {
      destroyed = true;
      spring.destroy();
      pointerSamples = [];
      pending = null;
    },
  };
}
