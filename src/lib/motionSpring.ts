import { springStep } from './pageSwipe';

export type FrameClock = {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
};

export type MotionSample = { position: number; velocity: number };

export function createMotionSpring(options: {
  clock: FrameClock;
  initial: number;
  onFrame(sample: MotionSample): void;
  onRest(): void;
}): {
  read(): MotionSample;
  jump(position: number): void;
  retarget(target: number, velocity?: number): void;
  pause(): MotionSample;
  destroy(): void;
} {
  let sample: MotionSample = { position: options.initial, velocity: 0 };
  let target = options.initial;
  let frame: number | null = null;
  let lastTime = options.clock.now();
  let destroyed = false;

  function cancel(): void {
    if (frame === null) return;
    options.clock.cancel(frame);
    frame = null;
  }

  function isResting(): boolean {
    return Math.abs(sample.position - target) <= 0.5 && Math.abs(sample.velocity) <= 0.01;
  }

  function run(time: number): void {
    frame = null;
    if (destroyed) return;
    const elapsed = Math.min(32, Math.max(1, time - lastTime));
    lastTime = time;
    sample = springStep(sample.position, sample.velocity, target, elapsed);
    if (isResting()) sample = { position: target, velocity: 0 };
    options.onFrame(sample);
    if (sample.velocity === 0 && sample.position === target) {
      options.onRest();
      return;
    }
    frame = options.clock.request(run);
  }

  function schedule(): void {
    if (destroyed || frame !== null) return;
    frame = options.clock.request(run);
  }

  return {
    read: () => ({ ...sample }),
    jump(position) {
      cancel();
      target = position;
      sample = { position, velocity: 0 };
      lastTime = options.clock.now();
      if (!destroyed) options.onFrame(sample);
    },
    retarget(nextTarget, velocity) {
      if (destroyed) return;
      target = nextTarget;
      if (velocity !== undefined) sample = { ...sample, velocity };
      lastTime = options.clock.now();
      schedule();
    },
    pause() {
      cancel();
      return { ...sample };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
    },
  };
}
