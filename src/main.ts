import App from "./App.svelte";
import { mount } from "svelte";

let app;

if (!import.meta.env.SSR && typeof window !== "undefined") {
  app = mount(App, {
    target: document.getElementById("app")!,
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("SW update check failed", e);
      }
    });
  }
}

export default app;
