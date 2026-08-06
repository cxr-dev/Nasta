import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const outputPath = join(root, "public", "events-data.json");

const VISIT_STOCKHOLM_EVENTS_URL =
  "https://api.visitstockholm.com/api/public-v1/events/";
const failOnFetchError = process.env.FAIL_ON_EVENTS_FETCH_ERROR === "true";

async function main() {
  const allResults = [];

  for (let page = 1; page <= 5; page++) {
    const url = `${VISIT_STOCKHOLM_EVENTS_URL}?${new URLSearchParams({ size: "100", page: String(page) })}`;
    const res = await fetch(url);
    if (!res.ok) {
      const message = `fetch-events-data: page ${page} returned ${res.status}`;
      if (failOnFetchError) throw new Error(message);
      console.warn(`${message}, stopping pagination`);
      break;
    }
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length === 0) break;
    allResults.push(...data.results);
    if (data.results.length < 100) break;
  }

  // Deduplicate by event id — the API can return the same event across pages
  const seen = new Set();
  const deduped = allResults.filter((e) => {
    const key = e.id ?? e.url ?? JSON.stringify(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await writeFile(outputPath, JSON.stringify({ results: deduped }));
  console.log(`fetch-events-data: ${deduped.length} events (${allResults.length - deduped.length} duplicates removed) written to public/events-data.json`);
}

main().catch((err) => {
  if (failOnFetchError) {
    console.error("fetch-events-data: failed, stopping build —", err.message);
    process.exitCode = 1;
    return;
  }

  console.warn("fetch-events-data: failed, writing empty data —", err.message);
  writeFile(outputPath, JSON.stringify({ results: [] }));
});
