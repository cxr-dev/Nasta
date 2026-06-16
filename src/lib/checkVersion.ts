export async function checkVersion(): Promise<boolean> {
  const appVersion = import.meta.env.VITE_COMMIT_SHA;
  if (!appVersion) return false;

  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}version.json`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { version } = await res.json();
    return version !== appVersion;
  } catch {
    return false;
  }
}
