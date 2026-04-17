import { mount } from "svelte";
import App from "./App.svelte";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
      }
    } catch (e) {
      console.warn("SW update check failed", e);
    }
  });
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
