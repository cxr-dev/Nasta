import { describe, expect, it } from 'vitest';
import { createMotionSpring, type FrameClock } from './motionSpring';

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

describe('motion spring', () => {
  it('retargets from its live velocity without a second RAF loop', () => {
    const clock = makeClock();
    const frames: number[] = [];
    const spring = createMotionSpring({
      clock,
      initial: 0,
      onFrame: ({ position }) => frames.push(position),
      onRest: () => {},
    });

    spring.retarget(400, 1);
    expect(clock.pending()).toBe(1);
    clock.step();
    const velocityBeforeRetarget = spring.read().velocity;
    spring.retarget(0);
    expect(spring.read().velocity).toBeCloseTo(velocityBeforeRetarget, 6);
    expect(clock.pending()).toBe(1);
    expect(frames).toHaveLength(1);
  });

  it('pauses at the live position without reporting rest', () => {
    const clock = makeClock();
    let rests = 0;
    const spring = createMotionSpring({ clock, initial: 0, onFrame: () => {}, onRest: () => { rests += 1; } });
    spring.retarget(400, 1);
    clock.step();
    const paused = spring.pause();

    expect(paused.position).toBeGreaterThan(0);
    expect(paused.position).toBeLessThan(400);
    expect(spring.read()).toEqual(paused);
    expect(clock.pending()).toBe(0);
    expect(rests).toBe(0);
  });

  it('jump and destroy cancel scheduled work and never duplicate rest', () => {
    const clock = makeClock();
    const frames: number[] = [];
    let rests = 0;
    const spring = createMotionSpring({
      clock, initial: 0, onFrame: ({ position }) => frames.push(position), onRest: () => { rests += 1; },
    });
    spring.retarget(400, 1);
    spring.jump(80);
    expect(spring.read()).toEqual({ position: 80, velocity: 0 });
    expect(clock.pending()).toBe(0);
    expect(rests).toBe(0);
    spring.retarget(400);
    spring.destroy();
    clock.step(1_000);
    expect(frames).toEqual([80]);
    expect(rests).toBe(0);
  });
});
