import { describe, expect, it, vi } from 'vitest';
import { longPress } from './longPress';

function pointer(type: string, x = 0, y = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: 1 },
  });
  return event;
}

describe('longPress action', () => {
  it('waits for the threshold and cancels when a gesture moves', () => {
    vi.useFakeTimers();
    const node = document.createElement('div');
    const onLongPress = vi.fn();
    const action = longPress(node, { onLongPress, delay: 450 });

    node.dispatchEvent(pointer('pointerdown', 10, 10));
    vi.advanceTimersByTime(449);
    expect(onLongPress).not.toHaveBeenCalled();
    node.dispatchEvent(pointer('pointermove', 30, 10));
    vi.advanceTimersByTime(20);
    expect(onLongPress).not.toHaveBeenCalled();

    node.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(450);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    action.destroy();
    vi.useRealTimers();
  });
});
