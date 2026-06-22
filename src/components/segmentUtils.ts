import type { SegmentHealth } from "../types/deviation";
import { type SeverityThreshold } from "../stores/deviationStore.svelte";

export function severityRank(severity: string): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

export function severityFromImportance(importanceLevel: number): "info" | "warning" | "critical" {
  if (importanceLevel >= 4) return "critical";
  if (importanceLevel >= 2) return "warning";
  return "info";
}

export interface SiteDev {
  message: string;
  [key: string]: unknown;
}

export interface DisruptionDisplay {
  messages: SiteDev[];
  severity: "critical" | "affected" | "normal";
}

export function getDisruptionDisplay(
  siteDevs: any[],
  health: SegmentHealth | undefined,
  threshold: SeverityThreshold,
): DisruptionDisplay {
  // Prefer rich Deviations API text when available
  if (health?.reason) {
    return {
      messages: [{ message: health.reason }],
      severity: health.state === "critical" ? "critical" : "affected",
    };
  }

  // Fallback to Transport API stop_deviations, filtering by importance_level
  const filtered: SiteDev[] = [];
  let highestSeverity: "info" | "warning" | "critical" = "info";

  for (const dev of siteDevs) {
    const sev = severityFromImportance(dev.importance_level ?? 0);
    if (severityRank(sev) >= severityRank(threshold)) {
      filtered.push({ message: dev.message ?? "" });
      if (severityRank(sev) > severityRank(highestSeverity)) {
        highestSeverity = sev;
      }
    }
  }

  if (filtered.length > 0) {
    return {
      messages: filtered,
      severity: highestSeverity === "critical" ? "critical" : "affected",
    };
  }

  return { messages: [], severity: "normal" };
}

/** Legacy alias for callers that only need the messages array */
export function computeDisplayDevs(
  siteDevs: any[],
  healthReason?: string | null,
): any[] {
  if (healthReason) return [{ message: healthReason }];
  if (siteDevs.length > 0) return siteDevs;
  return [];
}

export function isSegmentDisrupted(
  siteDevsCount: number,
  healthState?: string | null,
): boolean {
  return siteDevsCount > 0 || (healthState != null && healthState !== "ok");
}
