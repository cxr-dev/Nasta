import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const initPagePath = path.join(projectRoot, "scripts", "playwright-mcp-init.ts");
const appUrl = "http://localhost:5173/";
const serverTimeoutMs = 30_000;
const requestTimeoutMs = 1_000;

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function spawnCommand(command, args, options) {
  if (process.platform !== "win32") {
    return spawn(command, args, options);
  }

  return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command, ...args], options);
}

async function isServerReady() {
  try {
    const response = await fetch(appUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const deadline = Date.now() + serverTimeoutMs;

  while (Date.now() < deadline) {
    if (await isServerReady()) return;
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${appUrl}`);
}

function startDevServer() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const server = spawnCommand(command, ["run", "dev", "--", "--host", "localhost", "--port", "5173"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  server.stdout.on("data", (chunk) => process.stderr.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return server;
}

async function stopDevServer(server) {
  if (!server || !server.pid || server.exitCode !== null) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("close", resolve);
      killer.once("error", resolve);
    });
  } else {
    server.kill("SIGTERM");
  }
}

async function main() {
  let devServer;

  try {
    if (!(await isServerReady())) {
      devServer = startDevServer();
      await waitForServer();
    }

    const mcpCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    const mcpArgs = ["-y", "@playwright/mcp", ...process.argv.slice(2)];
    const hasInitPage = mcpArgs.some(
      (argument) => argument === "--init-page" || argument.startsWith("--init-page="),
    );

    if (!hasInitPage) {
      mcpArgs.push("--init-page", initPagePath);
    }

    const mcp = spawnCommand(mcpCommand, mcpArgs, {
      cwd: projectRoot,
      stdio: "inherit",
      windowsHide: true,
    });

    const exitCode = await new Promise((resolve, reject) => {
      mcp.once("close", resolve);
      mcp.once("error", reject);
    });

    process.exitCode = exitCode ?? 1;
  } finally {
    await stopDevServer(devServer);
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
