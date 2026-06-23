export type DisruptionType = "protest" | "technical" | "snow" | "rain" | "storm" | "wind" | "ice" | "weather" | "general";

export function disruptionType(message: string): DisruptionType {
  const m = message.toLowerCase();
  if (/(protest|demonstration|strejk|blockad)/i.test(m)) return "protest";
  if (/(snow|snö)/i.test(m)) return "snow";
  if (/\b(rain|regn)\b/i.test(m)) return "rain";
  if (/storm/i.test(m)) return "storm";
  if (/wind/i.test(m)) return "wind";
  if (/\b(ice|icy)\b|is(?:ig|gata|halka|bana|ar\b|bildning)/i.test(m)) return "ice";
  if (/väder/i.test(m)) return "weather";
  if (/(signal|switch|technical|fault|fel|teknisk|power|\bel\b|track|spår)/i.test(m)) return "technical";
  return "general";
}
