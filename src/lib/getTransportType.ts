import type { TransportType } from "../types/page";

/**
 * Maps an SL transport mode string to the internal TransportType.
 * Handles aliases: "rail" → "train", "lightrail" → "tram", "ferry" → "boat".
 * Defaults to "bus" for unknown modes.
 */
export function getTransportType(mode?: string): TransportType {
  switch (mode?.toLowerCase()) {
    case "bus":
      return "bus";
    case "train":
    case "rail":
      return "train";
    case "metro":
      return "metro";
    case "tram":
    case "lightrail":
      return "tram";
    case "boat":
    case "ferry":
      return "boat";
    default:
      return "bus";
  }
}
