import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import preprocess from "svelte-preprocess";

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  preprocess: [
    // svelte-preprocess handles :global() and other Svelte CSS features before Vite's CSS pipeline
    preprocess({
      // Use LightningCSS for minification but let svelte-preprocess handle :global() transformation
      postcss: false,
    }),
    // vitePreprocess handles TypeScript
    vitePreprocess({ style: false }),
  ],
};
