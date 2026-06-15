import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const outputPath = join(root, "public", "events-data.json");

const VISIT_STOCKHOLM_EVENTS_URL =
  "https://api.visitstockholm.com/api/public-v1/events/";

async function main() {
  const url = `${VISIT_STOCKHOLM_EVENTS_URL}?${new URLSearchParams({ size: "100" })}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`fetch-events-data: API returned ${res.status}, writing empty data`);
    await writeFile(outputPath, JSON.stringify({ results: [] }));
    return;
  }

  const data = await res.json();
  await writeFile(outputPath, JSON.stringify(data));
  const count = Array.isArray(data.results) ? data.results.length : 0;
  console.log(`fetch-events-data: ${count} events written to public/events-data.json`);
}

main().catch((err) => {
  console.warn("fetch-events-data: failed, writing empty data —", err.message);
  writeFile(outputPath, JSON.stringify({ results: [] })).finally(() => process.exit(0));
});
