export function cleanStopName(name?: string): string {
  if (!name) return "";
  return name.replace(/^[^,]+,\s*/u, "").trim() || name;
}
