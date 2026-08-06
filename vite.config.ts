import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  return {
    base: mode === "production" ? "/Nasta/" : "/",
    plugins: [
      svelte(),
      VitePWA({
        devOptions: {
          enabled: false,
        },
        injectRegister: false,
        registerType: "prompt",
        includeAssets: ["logosvg.svg", "apple-touch-icon.png", "robots.txt"],
        manifest: {
          name: "Nästa",
          short_name: "Nästa",
          description: "Swedish public transit commute tracker",
          lang: "sv",
          theme_color: "#635BFF",
          background_color: "#635BFF",
          display: "standalone",
          orientation: "any",
          id: "./",
          start_url: "./",
          scope: "./",
          icons: [
            {
              src: "./logosvg.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
            {
              src: "./icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "./icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Exclude events-data.json from precache — it's served via runtimeCaching below
          // with NetworkFirst so the SW always picks up fresh data from the daily rebuild
          // without waiting for a SW update cycle.
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff}"],
          globIgnores: ["**/version.json"],
          maximumFileSizeToCacheInBytes: 3000000,
          skipWaiting: false,
          clientsClaim: false,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "navigation-cache",
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 3600,
                },
                networkTimeoutSeconds: 2,
              },
            },

            {
              urlPattern: /^https:\/\/transport\.integration\.sl\.se\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "sl-api-cache",
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60,
                },
                networkTimeoutSeconds: 5,
              },
            },

            // events-data.json: NetworkFirst with a short timeout so the app always gets
            // today's events from the rebuilt static file, falling back to cache when offline.
            {
              urlPattern: /events-data\.json$/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "events-data-cache",
                expiration: {
                  maxEntries: 5,
                  maxAgeSeconds: 43200, // 12 hours
                },
                networkTimeoutSeconds: 4,
              },
            },
            {
              urlPattern: /venue-mood\/.*\.(?:avif|webp)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "venue-mood-cache",
                expiration: {
                  maxEntries: 48,
                  maxAgeSeconds: 31536000,
                },
              },
            },
          ],
        },
      }),
    ],
    css: {
      transformer: "lightningcss",
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]"
        },
      },
    },
  };
});
