import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const distDir = resolve(process.cwd(), "dist");
const indexPath = resolve(distDir, "index.html");

const SERVER_RUNTIME_MARKERS = [
  "internal/server/render-context",
];
const MAX_ENTRY_JS_GZIP_BYTES = 180_000;
const MAX_PRECACHE_BYTES = 1_800_000;

async function main() {
  const indexHtml = await readFile(indexPath, "utf8");

  if (!indexHtml.includes('/Nasta/assets/')) {
    throw new Error("Build verification failed: index.html is missing /Nasta/assets/ references.");
  }

  const jsAssetMatches = [...indexHtml.matchAll(/src="([^"]+\/assets\/[^"]+\.js)"/g)];
  if (jsAssetMatches.length === 0) {
    throw new Error("Build verification failed: no JS asset references found in index.html.");
  }

  for (const match of jsAssetMatches) {
    const assetPath = match[1];
    const normalized = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
    const localPath = resolve(distDir, normalized.replace(/^Nasta\//, ""));
    const source = await readFile(localPath, "utf8");

    for (const marker of SERVER_RUNTIME_MARKERS) {
      if (source.includes(marker)) {
        throw new Error(
          `Build verification failed: found server-runtime marker "${marker}" in ${assetPath}.`,
        );
      }
    }

    // Guard against client bootstrap accidentally calling the server-only mount stub.
    // Example failing shape:
    //   function ko(){yo("mount")}
    //   ...
    //   ko(App,{target:document.getElementById("app")})
    const serverMountStub = source.match(
      /function\s+([A-Za-z_$][\w$]*)\s*\(\)\s*\{[^{}]{0,120}?\("mount"\)[^{}]*\}/,
    );
    if (serverMountStub) {
      const stubName = serverMountStub[1];
      const callCount = (source.match(new RegExp(`\\b${stubName}\\(`, "g")) ?? []).length;
      if (callCount > 1) {
        throw new Error(
          `Build verification failed: detected server mount stub "${stubName}" invoked in ${assetPath}.`,
        );
      }
    }

    const gzipSize = gzipSync(source).byteLength;
    if (gzipSize > MAX_ENTRY_JS_GZIP_BYTES) {
      throw new Error(
        `Build verification failed: entry JavaScript gzip size ${gzipSize} B exceeds ${MAX_ENTRY_JS_GZIP_BYTES} B.`,
      );
    }
  }

  const serviceWorker = await readFile(resolve(distDir, "sw.js"), "utf8");
  const precacheUrls = new Set(
    [...serviceWorker.matchAll(/url:"([^\"]+)"/g)].map((match) => match[1]),
  );
  const optionalPrecacheUrls = [...precacheUrls].filter((url) =>
    /\/assets\/(?:opening_hours\.esm|maplibre-gl)-.*\.(?:js|css)$/i.test(url),
  );

  if (optionalPrecacheUrls.length > 0) {
    throw new Error(
      `Build verification failed: optional feature assets are precached: ${optionalPrecacheUrls.join(", ")}.`,
    );
  }

  let precacheBytes = 0;
  for (const url of precacheUrls) {
    if (/^https?:\/\//i.test(url)) continue;
    const localPath = resolve(distDir, url.replace(/^\//, "").replace(/^Nasta\//, ""));
    precacheBytes += (await stat(localPath)).size;
  }

  if (precacheBytes > MAX_PRECACHE_BYTES) {
    throw new Error(
      `Build verification failed: precache size ${precacheBytes} B exceeds ${MAX_PRECACHE_BYTES} B.`,
    );
  }

  console.log(`Build verification passed (entry gzip: <= ${MAX_ENTRY_JS_GZIP_BYTES} B, precache: ${precacheBytes} B).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
