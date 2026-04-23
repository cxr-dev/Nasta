import type {
  DeviationMessage,
  DeviationMessageVariant,
  DeviationScopeLine,
  DeviationScopeStopArea,
  DeviationSeverity,
} from "../types/deviation";
import { loadDeviationCache, saveDeviationCache } from "./deviationCache";

const DEVIATIONS_URL = "https://deviations.integration.sl.se/v1/messages";

function toTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? undefined : ts;
}

function toSeverity(
  importanceLevel: number,
  influenceLevel: number,
  urgencyLevel: number,
): DeviationSeverity {
  const score = importanceLevel * 2 + influenceLevel + urgencyLevel;
  if (score >= 8 || importanceLevel >= 4 || urgencyLevel >= 3) return "critical";
  if (score >= 5 || importanceLevel >= 3) return "warning";
  return "info";
}

function toMessageVariants(raw: unknown): DeviationMessageVariant[] {
  if (!Array.isArray(raw)) return [];
  const result: DeviationMessageVariant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const header = typeof rec.header === "string" ? rec.header : "";
    if (!header) continue;
    result.push({
      language: typeof rec.language === "string" ? rec.language : "sv",
      header,
      details: typeof rec.details === "string" ? rec.details : undefined,
      scopeAlias: typeof rec.scope_alias === "string" ? rec.scope_alias : undefined,
      webLink: typeof rec.weblink === "string" ? rec.weblink : undefined,
    });
  }
  return result;
}

function toScopeLines(raw: unknown): DeviationScopeLine[] {
  if (!Array.isArray(raw)) return [];
  const result: DeviationScopeLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "number" && typeof rec.id !== "string") continue;
    result.push({
      id: String(rec.id),
      designation:
        typeof rec.designation === "string" ? rec.designation : undefined,
      transportMode:
        typeof rec.transport_mode === "string"
          ? rec.transport_mode.toLowerCase()
          : undefined,
      name: typeof rec.name === "string" ? rec.name : undefined,
    });
  }
  return result;
}

function toScopeStopAreas(raw: unknown): DeviationScopeStopArea[] {
  if (!Array.isArray(raw)) return [];
  const result: DeviationScopeStopArea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "number" && typeof rec.id !== "string") continue;
    result.push({
      id: String(rec.id),
      name: typeof rec.name === "string" ? rec.name : undefined,
    });
  }
  return result;
}

function parseMessage(raw: unknown): DeviationMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const idValue = rec.deviation_case_id;
  if (typeof idValue !== "number" && typeof idValue !== "string") return null;

  const priority =
    rec.priority && typeof rec.priority === "object"
      ? (rec.priority as Record<string, unknown>)
      : {};
  const importanceLevel =
    typeof priority.importance_level === "number" ? priority.importance_level : 1;
  const influenceLevel =
    typeof priority.influence_level === "number" ? priority.influence_level : 1;
  const urgencyLevel =
    typeof priority.urgency_level === "number" ? priority.urgency_level : 1;

  const scope =
    rec.scope && typeof rec.scope === "object"
      ? (rec.scope as Record<string, unknown>)
      : {};
  const publish =
    rec.publish && typeof rec.publish === "object"
      ? (rec.publish as Record<string, unknown>)
      : {};

  const createdAt = toTimestamp(rec.created) ?? Date.now();
  const modifiedAt = toTimestamp(rec.modified) ?? createdAt;

  return {
    id: String(idValue),
    createdAt,
    modifiedAt,
    publishFrom: toTimestamp(publish.from),
    publishTo: toTimestamp(publish.upto),
    severity: toSeverity(importanceLevel, influenceLevel, urgencyLevel),
    importanceLevel,
    influenceLevel,
    urgencyLevel,
    messageVariants: toMessageVariants(rec.message_variants),
    scope: {
      lines: toScopeLines(scope.lines),
      stopAreas: toScopeStopAreas(scope.stop_areas),
    },
  };
}

export async function getDeviations(
  siteIds: string[],
  lineDesignations: string[],
): Promise<{ messages: DeviationMessage[]; fromCache: boolean }> {
  const params = new URLSearchParams();
  params.set("future", "true");
  siteIds
    .filter(Boolean)
    .forEach((siteId) => params.append("site", String(siteId)));
  lineDesignations
    .filter(Boolean)
    .forEach((line) => {
      const parsed = Number.parseInt(line, 10);
      if (!Number.isNaN(parsed)) params.append("line", String(parsed));
    });

  const url = `${DEVIATIONS_URL}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Deviation API error: ${response.status}`);
    const data = (await response.json()) as unknown[];
    const messages = Array.isArray(data)
      ? data
          .map(parseMessage)
          .filter((msg): msg is DeviationMessage => msg !== null)
      : [];
    saveDeviationCache(messages);
    return { messages, fromCache: false };
  } catch (error) {
    const cached = loadDeviationCache();
    if (cached) {
      return { messages: cached.messages, fromCache: true };
    }
    if (import.meta.env.DEV) {
      console.warn("[slDeviations] Failed to fetch deviations:", error);
    }
    return { messages: [], fromCache: false };
  }
}

export function pickPreferredMessageText(
  message: DeviationMessage,
  preferredLanguage: "sv" | "en" = "sv",
): { header: string; details?: string; language: string } {
  const variants = message.messageVariants;
  if (!variants.length) return { header: "", language: preferredLanguage };

  const preferred = variants.find((v) => v.language === preferredLanguage);
  if (preferred) {
    return {
      header: preferred.header,
      details: preferred.details,
      language: preferred.language,
    };
  }

  const fallbackEn = variants.find((v) => v.language === "en");
  if (fallbackEn) {
    return {
      header: fallbackEn.header,
      details: fallbackEn.details,
      language: fallbackEn.language,
    };
  }

  const first = variants[0];
  return { header: first.header, details: first.details, language: first.language };
}
