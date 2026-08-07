const historyViewStateKey = 'nastaFullscreenView';

type HistoryViewCallbacks = {
  onEnter: () => void;
  onExit: () => void;
};

export function createHistoryView(id: string, callbacks: HistoryViewCallbacks) {
  let active = false;
  let backPending = false;

  function currentId() {
    return history.state?.[historyViewStateKey] as string | undefined;
  }

  function handlePopState() {
    backPending = false;
    const shouldBeActive = currentId() === id;
    if (shouldBeActive === active) return;
    active = shouldBeActive;
    if (active) callbacks.onEnter();
    else callbacks.onExit();
  }

  window.addEventListener('popstate', handlePopState);

  return {
    enter() {
      if (active && currentId() === id) return;
      active = true;
      backPending = false;
      if (currentId() === id) return;
      const currentState = history.state && typeof history.state === 'object' ? history.state : {};
      history.pushState({ ...currentState, [historyViewStateKey]: id }, '', location.href);
    },
    back() {
      if (!active || backPending) return;
      if (currentId() === id) {
        backPending = true;
        history.back();
        return;
      }
      active = false;
      callbacks.onExit();
    },
    destroy() {
      active = false;
      backPending = false;
      window.removeEventListener('popstate', handlePopState);
    },
  };
}
