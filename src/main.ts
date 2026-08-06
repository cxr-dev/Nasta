import "./providers/init";
import App from "./App.svelte";
import { mount } from "svelte";
import { getServiceWorkerUrl } from "./lib/sw";
import { checkVersion } from "./lib/checkVersion";

let app;

if (!import.meta.env.SSR && typeof window !== "undefined") {
  app = mount(App, {
    target: document.getElementById("app")!,
  });

  if ("serviceWorker" in navigator && !import.meta.env.DEV) {
    const swUrl = getServiceWorkerUrl();

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: import.meta.env.BASE_URL,
          updateViaCache: "none",
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent("pwa-update-available"));
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
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
            if (hasUpdate) registration.update().catch(() => {});
          });

          registration.update().catch(() => {});
        });

        return registration;
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[PWA] Registration failed:", e);
      }
    }

    const registerAfterLoad = () => {
      window.setTimeout(() => {
        void registerServiceWorker();
      }, 0);
    };

    if (document.readyState === "complete") {
      registerAfterLoad();
    } else {
      window.addEventListener("load", registerAfterLoad, { once: true });
    }

    checkVersion().then((hasUpdate) => {
      if (hasUpdate) navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
    });

  }
}

export default app;
