export interface LongPressOptions {
  onLongPress: (event: PointerEvent) => void;
  delay?: number;
  movementThreshold?: number;
}

export function longPress(node: HTMLElement, options: LongPressOptions) {
  let config = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let activePointerId: number | null = null;
  let triggered = false;
  let suppressClick = false;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function reset() {
    clearTimer();
    activePointerId = null;
    triggered = false;
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.button !== 0) return;

    reset();
    suppressClick = false;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => {
      triggered = true;
      suppressClick = true;
      if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
      config.onLongPress(event);
      setTimeout(() => { suppressClick = false; }, 700);
    }, config.delay ?? 450);
  }

  function handlePointerMove(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;
    const threshold = config.movementThreshold ?? 10;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > threshold) {
      reset();
    }
  }

  function handlePointerUp(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;
    if (triggered) {
      event.preventDefault();
      event.stopPropagation();
    }
    reset();
  }

  function handlePointerCancel() {
    reset();
  }

  function handleClick(event: MouseEvent) {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  node.addEventListener('pointerdown', handlePointerDown);
  node.addEventListener('pointermove', handlePointerMove);
  node.addEventListener('pointerup', handlePointerUp);
  node.addEventListener('pointercancel', handlePointerCancel);
  node.addEventListener('click', handleClick, true);

  return {
    update(nextOptions: LongPressOptions) {
      config = nextOptions;
    },
    destroy() {
      reset();
      suppressClick = false;
      node.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
      node.removeEventListener('pointercancel', handlePointerCancel);
      node.removeEventListener('click', handleClick, true);
    },
  };
}
