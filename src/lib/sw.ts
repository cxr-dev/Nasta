export function getServiceWorkerUrl(baseUrl: string = import.meta.env.BASE_URL): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalized}sw.js`;
}
