import App from "./App.svelte";
import { mount } from "svelte";
import { getServiceWorkerUrl } from "./lib/sw";
import { checkVersion } from "./lib/checkVersion";

let app;

if (!import.meta.env.SSR && typeof window !== "undefined") {
  app = mount(App, {
    target: document.getElementById("app")!,
  });

  if ("serviceWorker" in navigator) {
    const swUrl = getServiceWorkerUrl();

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: import.meta.env.BASE_URL,
          updateViaCache: "none",
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
          window.dispatchEvent(new CustomEvent("pwa-update-available"));
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
              window.dispatchEvent(new CustomEvent("pwa-update-available"));
            }
          });
        });

        const FIVE_MINUTES = 5 * 60 * 1000;
        setInterval(async () => {
          if (!navigator.onLine) return;
          try {
            const resp = await fetch(swUrl, { cache: "no-store" });
            if (resp.status === 200) await registration.update();
          } catch { /* ignore */ }
        }, FIVE_MINUTES);

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          if (!navigator.onLine) return;

          checkVersion().then((hasUpdate) => {
            if (hasUpdate) {
              window.dispatchEvent(new CustomEvent("pwa-update-available"));
            }
          });

          registration.update().catch(() => {});
        });

        return registration;
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[PWA] Registration failed:", e);
      }
    }

    registerServiceWorker();

    checkVersion().then((hasUpdate) => {
      if (hasUpdate) {
        window.dispatchEvent(new CustomEvent("pwa-update-available"));
      }
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__swReloaded) return;
      window.__swReloaded = true;
      window.location.reload();
    });
  }
}

declare global {
  interface Window {
    __swReloaded?: boolean;
  }
}

export default app;
