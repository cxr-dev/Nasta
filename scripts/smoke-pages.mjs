const deploymentUrl = process.env.DEPLOYMENT_URL;
const expectedVersion = process.env.EXPECTED_VERSION;
const MAX_ATTEMPTS = 8;
const RETRY_DELAY_MS = 5_000;

if (!deploymentUrl || !expectedVersion) {
  throw new Error("DEPLOYMENT_URL and EXPECTED_VERSION are required.");
}

function resourceUrl(path) {
  const url = new URL(path, deploymentUrl);
  url.searchParams.set("deployment", expectedVersion);
  return url;
}

async function verifyDeployment() {
  const versionResponse = await fetch(resourceUrl("version.json"), { cache: "no-store" });
  if (!versionResponse.ok) {
    throw new Error(`version.json returned ${versionResponse.status}.`);
  }

  const version = await versionResponse.json();
  if (version.version !== expectedVersion) {
    throw new Error(`version.json reports ${version.version ?? "no version"}, expected ${expectedVersion}.`);
  }

  for (const path of ["index.html", "manifest.webmanifest", "sw.js"]) {
    const response = await fetch(resourceUrl(path), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${path} returned ${response.status}.`);
    }
  }
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    await verifyDeployment();
    console.log(`Deployment smoke test passed on attempt ${attempt}.`);
    break;
  } catch (error) {
    if (attempt === MAX_ATTEMPTS) throw error;
    console.warn(`Deployment smoke test attempt ${attempt} failed: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}
