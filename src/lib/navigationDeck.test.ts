import { describe, expect, it } from 'vitest';
import type { DeckDestination } from './deckNavigation';
import { createNavigationDeck, type DeckCommit, type FrameClock } from './navigationDeck';

function makeClock(): FrameClock & { step(ms?: number): void; pending(): number } {
  let time = 0;
  let nextId = 0;
  const callbacks = new Map<number, (time: number) => void>();
  return {
    now: () => time,
    request(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) { callbacks.delete(id); },
    step(ms = 16) {
      time += ms;
      const frame = [...callbacks.values()];
      callbacks.clear();
      frame.forEach((callback) => callback(time));
    },
    pending: () => callbacks.size,
  };
}

const destinations: DeckDestination[] = [
  { kind: 'page', pageId: 'a' },
  { kind: 'page', pageId: 'b' },
  { kind: 'nearby' },
];

function deckAt(index = 1) {
  const clock = makeClock();
  const commits: DeckCommit[] = [];
  const deck = createNavigationDeck({
    destinations,
    initial: destinations[index],
    width: 400,
    clock,
    onFrame: () => {},
    onCommit: (commit) => commits.push(commit),
  });
  return { clock, commits, deck };
}

function settle(clock: ReturnType<typeof makeClock>): void {
  for (let index = 0; index < 120 && clock.pending(); index += 1) clock.step();
}

describe('navigation deck', () => {
  it('uses the grabbed presentation rather than the committed page', () => {
    const { clock, commits, deck } = deckAt(0);
    deck.by(1);
    clock.step();
    const before = deck.read().position * 400;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(400);

    deck.beginDrag(200);
    expect(deck.read().position * 400).toBeCloseTo(before, 5);
    deck.drag(220, clock.now() + 16);
    expect(deck.read().position * 400).toBeCloseTo(before - 20, 5);
    expect(commits).toEqual([]);
  });

  it('chooses only the source or one adjacent destination for a touch release', () => {
    const { clock, commits, deck } = deckAt();
    deck.beginDrag(200);
    deck.drag(280, 1_000);
    deck.release(1_100);
    settle(clock);
    expect(deck.read().committed).toEqual(destinations[1]);

    deck.beginDrag(200);
    deck.drag(40, 1_200);
    deck.release(1_216);
    settle(clock);
    expect(deck.read().committed).toEqual(destinations[2]);
    expect(commits.at(-1)).toMatchObject({ from: destinations[1], to: destinations[2] });
  });

  it('uses projection for reversal and returns to the source', () => {
    const { clock, deck } = deckAt();
    deck.goTo(destinations[2]);
    clock.step();
    deck.beginDrag(200);
    deck.drag(232, clock.now() + 16);
    deck.release(clock.now() + 32);
    settle(clock);
    expect(deck.read().committed).toEqual(destinations[1]);
  });

  it('reverses an in-flight keyboard request before committing it', () => {
    const { clock, commits, deck } = deckAt(0);
    deck.by(1);
    clock.step();
    deck.by(-1);
    settle(clock);
    expect(deck.read().committed).toEqual(destinations[0]);
    expect(commits).toEqual([]);
  });

  it('keeps a pending keyboard destination through layout synchronization', () => {
    const { clock, commits, deck } = deckAt(0);
    deck.by(1);
    clock.step();
    deck.update(destinations, 420);
    deck.by(-1);
    settle(clock);

    expect(deck.read().committed).toEqual(destinations[0]);
    expect(commits).toEqual([]);
  });

  it('returns from Nearby after a synchronized navigation', () => {
    const { clock, commits, deck } = deckAt(1);
    deck.by(1);
    settle(clock);
    deck.update(destinations, 420);
    deck.by(-1);
    settle(clock);

    expect(deck.read().committed).toEqual(destinations[1]);
    expect(commits).toEqual([
      { from: destinations[1], to: destinations[2], historyMode: 'auto' },
      { from: destinations[2], to: destinations[1], historyMode: 'auto' },
    ]);
  });

  it('reconciles deleted destinations without a history commit', () => {
    const { clock, commits, deck } = deckAt(1);
    deck.update([destinations[0], destinations[2]], 400);
    settle(clock);
    expect(deck.read().committed).toEqual(destinations[2]);
    expect(commits).toEqual([]);
  });
});
