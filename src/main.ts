import App from "./App.svelte";
import { mount } from "svelte";
import { getServiceWorkerUrl } from "./lib/sw";

let app;

if (!import.meta.env.SSR && typeof window !== "undefined") {
  app = mount(App, {
    target: document.getElementById("app")!,
  });

  // PWA update notification
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

  // Import PWA module dynamically to register update handler
  if ("serviceWorker" in navigator) {
    // @ts-ignore - virtual module
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        updateSW = registerSW({
          onNeedRefresh() {
            // Emit custom event that the app can listen to
            window.dispatchEvent(
              new CustomEvent("pwa-update-available", { detail: { updateSW } }),
            );
          },
          onOfflineReady() {
            if (import.meta.env.DEV)
              console.log("[PWA] App is ready to work offline");
          },
        });
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.warn("[PWA] Failed to register:", e);
      });

    // Fallback: Manual update check
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration(
          getServiceWorkerUrl(),
        );
        if (registration) {
          await registration.update();
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("SW update check failed", e);
      }
    });

    // Controller change fallback (for safety)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__swReloaded) return;
      window.__swReloaded = true;
      window.location.reload();
    });
  }
}

// Type declaration for reload flag
declare global {
  interface Window {
    __swReloaded?: boolean;
  }
}

export default app;
