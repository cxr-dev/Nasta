export interface SiteDev {
  message: string;
  [key: string]: unknown;
}

export function computeDisplayDevs(
  siteDevs: SiteDev[],
  healthReason?: string | null,
): SiteDev[] {
  if (siteDevs.length > 0) return siteDevs;
  if (healthReason) return [{ message: healthReason }];
  return [];
}

export function isSegmentDisrupted(
  siteDevsCount: number,
  healthState?: string | null,
): boolean {
  return siteDevsCount > 0 || (healthState != null && healthState !== 'ok');
}
