import type { SegmentHealth } from "../types/deviation";
import type { DepartureDeviation } from "../types/departure";
import { type SeverityThreshold } from "../stores/deviationStore.svelte";
import { pickPreferredMessageText } from "../services/slDeviations";

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
  preferredLanguage: "sv" | "en" = "sv",
  segmentLine?: string,
  /** Departure-level deviations — these actually affect the specific journey
   *  (e.g. skipped stops). Highest priority after Deviations API health. */
  departureDeviations?: DepartureDeviation[],
  /** Site ID of the departure stop — used to filter stop_deviations by scope
   *  so cross-station bleed doesn't occur (e.g. Odenplan closure on Slussen cards). */
  stopSiteId?: string,
): DisruptionDisplay {
  // Priority 1: Rich Deviations API (most accurate, pre-filtered by line+site)
  if (health?.messages && health.messages.length > 0) {
    const text = pickPreferredMessageText(health.messages[0], preferredLanguage);
    const msgText = text.header || text.details || "";
    if (msgText) {
      return {
        messages: [{ message: msgText }],
        severity: health.state === "critical" ? "critical" : "affected",
      };
    }
  }

  // Priority 2: health.reason from Deviations API (resolved at fetch time)
  if (health?.reason) {
    return {
      messages: [{ message: health.reason }],
      severity: health.state === "critical" ? "critical" : "affected",
    };
  }

  // Priority 3: Departure-level deviations from SL Transport API —
  // these are the deviations attached to the specific journey (e.g. skipped stops).
  if (departureDeviations && departureDeviations.length > 0) {
    const matching: SiteDev[] = [];
    let maxImportance = 0;
    for (const dev of departureDeviations) {
      const importance = dev.importance_level ?? 0;
      const mapped = severityFromImportance(importance);
      if (severityRank(mapped) < severityRank(threshold)) continue;
      matching.push({ message: dev.message });
      if (importance > maxImportance) maxImportance = importance;
    }
    if (matching.length > 0) {
      const topSeverity = severityFromImportance(maxImportance);
      return {
        messages: matching,
        severity: topSeverity === "critical" ? "critical" : "affected",
      };
    }
  }

  // Priority 4: Transport API stop_deviations — last-resort fallback.
  // Filter by scope.lines AND scope stop_points/stop_areas to prevent cross-station
  // bleed (e.g. "Green line closed at Odenplan" on every Slussen departure card).
  if (siteDevs.length > 0 && segmentLine != null) {
    const matching: SiteDev[] = [];
    let maxImportance = 0;
    for (const dev of siteDevs) {
      const devLines: number[] = dev.scope?.lines ?? [];
      const matchesLine = devLines.some((l) => String(l) === segmentLine);
      if (!matchesLine) continue;

      // If we know the stop site ID, check scope for relevance
      if (stopSiteId) {
        const siteIdNum = Number(stopSiteId);
        const matchesStopPoint = (dev.scope?.stop_points ?? []).some(
          (sp: any) => sp.id === siteIdNum || sp.id === String(siteIdNum),
        );
        const matchesStopArea = (dev.scope?.stop_areas ?? []).some(
          (sa: any) => sa.id === siteIdNum || sa.id === String(siteIdNum),
        );
        if (!matchesStopPoint && !matchesStopArea) continue;
      }

      const importance: number = dev.importance_level ?? 0;
      const mapped = severityFromImportance(importance);
      if (severityRank(mapped) < severityRank(threshold)) continue;
      matching.push({ message: dev.message ?? "" });
      if (importance > maxImportance) maxImportance = importance;
    }
    if (matching.length > 0) {
      const topSeverity = severityFromImportance(maxImportance);
      return {
        messages: matching,
        severity: topSeverity === "critical" ? "critical" : "affected",
      };
    }
  }

  return { messages: [], severity: "normal" };
}



export function isSegmentDisrupted(
  siteDevsCount: number,
  healthState?: string | null,
): boolean {
  return siteDevsCount > 0 || (healthState != null && healthState !== "ok");
}
