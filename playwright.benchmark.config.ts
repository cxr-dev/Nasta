import { defineConfig, devices } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

export default defineConfig({
  testDir: './tests/benchmarks',
  testMatch: 'mobile.bench.spec.ts',
  outputDir: './test-results/benchmarks/samples',
  workers: 1,
  repeatEach: 5,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['./tests/benchmarks/reporter.ts']],
  metadata: {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    buildFingerprint: createHash('sha256').update(readFileSync('dist/index.html')).digest('hex'),
    environment: {
      runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
      os: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model, cores: os.cpus().length,
      memoryGiB: Math.round(os.totalmem() / 1024 ** 3), node: process.version,
      viewport: { width: 390, height: 844 },
      deviceProfile: 'iPhone 17', scenarioVersion: 1,
      conditions: 'production preview; SW blocked; normal motion; mocked APIs; external fonts blocked; API delay 100ms',
      injectedDelayMs: Number(process.env.BENCH_DELAY_MS || 0),
    },
  },
  use: {
    ...devices['iPhone 17'],
    viewport: { width: 390, height: 844 },
    browserName: 'webkit',
    baseURL: 'http://localhost:4173/Nasta/',
    serviceWorkers: 'block',
    locale: 'en-US', timezoneId: 'Europe/Stockholm',
    trace: 'off', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host localhost --port 4173 --strictPort',
    url: 'http://localhost:4173/Nasta/',
    reuseExistingServer: !process.env.CI,
  },
});
