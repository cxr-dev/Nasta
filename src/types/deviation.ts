export type DeviationSeverity = "info" | "warning" | "critical";

export interface DeviationMessageVariant {
  language: string;
  header: string;
  details?: string;
  scopeAlias?: string;
  webLink?: string;
}

export interface DeviationScopeLine {
  id: string;
  designation?: string;
  transportMode?: string;
  name?: string;
}

export interface DeviationScopeStopArea {
  id: string;
  name?: string;
}

export interface DeviationMessage {
  id: string;
  createdAt: number;
  modifiedAt: number;
  publishFrom?: number;
  publishTo?: number;
  severity: DeviationSeverity;
  importanceLevel: number;
  influenceLevel: number;
  urgencyLevel: number;
  messageVariants: DeviationMessageVariant[];
  scope: {
    lines: DeviationScopeLine[];
    stopAreas: DeviationScopeStopArea[];
  };
}

export type SegmentHealthState = "ok" | "affected" | "critical";

export interface SegmentHealth {
  state: SegmentHealthState;
  severity: DeviationSeverity | null;
  reason: string | null;
  messages: DeviationMessage[];
  updatedAt: number;
}

