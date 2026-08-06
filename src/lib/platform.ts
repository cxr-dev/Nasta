export interface PlatformLifecycleState {
  isVisible: boolean;
  isOnline: boolean;
}

export function subscribeToPlatformLifecycle(
  callback: (state: PlatformLifecycleState) => void,
): () => void {
  const getState = (): PlatformLifecycleState => ({
    isVisible: document.visibilityState === "visible",
    isOnline: navigator.onLine,
  });
  const notify = () => callback(getState());
  const notifyPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) notify();
  };
  const notifyHidden = () => callback({ isVisible: false, isOnline: navigator.onLine });

  document.addEventListener("visibilitychange", notify);
  window.addEventListener("pageshow", notifyPageShow);
  window.addEventListener("pagehide", notifyHidden);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);

  return () => {
    document.removeEventListener("visibilitychange", notify);
    window.removeEventListener("pageshow", notifyPageShow);
    window.removeEventListener("pagehide", notifyHidden);
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}
