import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { writeFileSync } from "fs";

export default defineConfig({
  base: "/Nasta/",
  plugins: [
    svelte(),
    VitePWA({
      devOptions: {
        enabled: false, // <-- Add this
      },
      registerType: "autoUpdate",
      includeAssets: ["logosvg.svg", "apple-touch-icon.png", "robots.txt"],
      manifest: {
        name: "Nästa - Commute Dashboard",
        short_name: "Nästa",
        description: "Swedish public transit commute tracker",
        theme_color: "#635BFF",
        background_color: "#635BFF",
        display: "standalone",
        orientation: "portrait",
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3000000,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: (req: Request) => req.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 86400,
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern:
              /^https:\/\/transport\.integration\.sl\.se\/v1\/sites.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "sl-sites-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 86400,
              },
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
        ],
      },
    }),
  ],
  build: {
    target: "esnext",
    minify: "esbuild",
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
