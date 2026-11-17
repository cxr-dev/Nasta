import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';

type Sample = { scenario: string; status: string; ms?: number; browser?: string; error?: string };
type Report = { metadata: Record<string, unknown>; samples: Sample[]; status?: string; errors: string[] };

export default class BenchmarkReporter implements Reporter {
  private report: Report = { metadata: {}, samples: [], errors: [] };
  onBegin(config: FullConfig) { this.report.metadata = config.metadata; }
  onTestEnd(test: TestCase, result: TestResult) {
    const attachment = result.attachments.find((item) => item.name === 'benchmark');
    const timing = attachment ? JSON.parse(attachment.body?.toString() ?? readFileSync(attachment.path!, 'utf8')) : {};
    this.report.samples.push({ scenario: test.title, status: result.status, ...timing, error: result.error?.message });
  }
  onError(error: { message?: string }) { this.report.errors.push(error.message ?? 'Unknown runner error'); }
  onEnd(result: FullResult) {
    this.report.status = result.status;
    const baselinePath = 'tests/benchmarks/baseline.json';
    const baseline: Report | null = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
    const compatible = baseline && baseline.status === 'passed' && result.status === 'passed'
      && JSON.stringify(baseline.metadata.environment) === JSON.stringify(this.report.metadata.environment)
      && baseline.samples[0]?.browser === this.report.samples[0]?.browser;
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const rows = [...new Set(this.report.samples.map((s) => s.scenario))].map((scenario) => {
      const samples = this.report.samples.filter((s) => s.scenario === scenario);
      const values = samples.filter((s) => s.status === 'passed' && s.ms !== undefined).map((s) => s.ms!);
      const previous = baseline?.samples.filter((s) => s.scenario === scenario && s.status === 'passed' && s.ms !== undefined).map((s) => s.ms!) ?? [];
      const comparison = compatible && previous.length && values.length ? `${(median(values) - median(previous)).toFixed(1)} ms` : 'not comparable';
      return `| ${scenario} | ${values.length}/${samples.length} | ${values.length ? median(values).toFixed(1) : '—'} | ${values.length ? `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}` : '—'} | ${comparison} |`;
    });
    const summary = `# Mobile WebKit benchmark\n\nStatus: ${result.status}. Timing comparisons are report-only.\n\n${baseline ? compatible ? 'Compatible baseline.' : 'Baseline environment/browser differs; timings are not compared.' : 'No baseline recorded.'}\n\n| Scenario | Passed samples | Median ms | Range ms | Median change |\n|---|---|---|---|---|\n${rows.join('\n')}\n\nMetadata and all failures/raw samples: results.json. These are desktop WebKit measurements, not iPhone or installed-PWA timings.\n`;
    mkdirSync('test-results/benchmarks', { recursive: true });
    writeFileSync('test-results/benchmarks/results.json', JSON.stringify(this.report, null, 2));
    writeFileSync('test-results/benchmarks/summary.md', summary);
    console.log(summary);
  }
}
