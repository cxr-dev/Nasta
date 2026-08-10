/**
 * Open SL tickets in the native SL app when possible, falling back to the
 * SL web site otherwise.
 *
 * iOS: the SL app registers the `sl://` custom scheme (confirmed by testing
 * `sl://` from Safari on a physical iPhone). The active-ticket path
 * `/privat/min-biljett` is NOT a verified Universal Link (the live AASA only
 * declares `/privat/min-biljett/voucher-code` + `/lana/*`), so an https link
 * would open Safari instead of the app. We therefore attempt the `sl://`
 * scheme first and fall back to the https web view if the app is not
 * installed. Custom-scheme success cannot be detected directly, so we arm a
 * short timer plus visibility/`blur`/`pagehide` listeners: if the app
 * launches, the page is backgrounded and we cancel the fallback; if the page
 * is still visible when the timer fires, the app is missing and we navigate
 * to the web fallback.
 *
 * Android: `assetlinks.json` for `com.sl.SLBiljetter` declares
 * `delegate_permission/common.handle_all_urls`, so `https://sl.se/...` already
 * opens the SL app directly via App Links when installed, and falls back to
 * the browser when not. We keep the plain https link there (no `sl://`, which
 * would hard-error when the app is missing).
 *
 * Desktop: plain https link.
 */

const IOS_UA = /iPhone|iPad|iPod/;
const SL_WEB_FALLBACK = "https://sl.se/privat/min-biljett";
const SCHEME_URL = "sl://";
const FALLBACK_DELAY_MS = 1500;

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if (IOS_UA.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports a Mac user agent in desktop mode; distinguish via
  // support for touch and a Mac platform.
  return (
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1
  );
}

function defaultNavigate(url: string): void {
  window.location.href = url;
}

export function openSlTickets(
  navigate: (url: string) => void = defaultNavigate,
): void {
  if (typeof window === "undefined") return;
  if (!isIOS()) {
    window.open(SL_WEB_FALLBACK, "_blank", "noopener");
    return;
  }

  // iOS: attempt the custom scheme, with a web fallback if the app is absent.
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    window.removeEventListener("visibilitychange", cancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("pagehide", cancel);
  };

  const fireFallback = () => {
    if (cancelled) return;
    cancel();
    navigate(SL_WEB_FALLBACK);
  };

  window.addEventListener("visibilitychange", cancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("pagehide", cancel);

  try {
    navigate(SCHEME_URL);
  } catch {
    // Scheme navigation should not throw, but if it does, go straight to web.
    cancel();
    navigate(SL_WEB_FALLBACK);
    return;
  }

  fallbackTimer = setTimeout(fireFallback, FALLBACK_DELAY_MS);
}