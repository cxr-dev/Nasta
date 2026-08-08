import { buildShareUrl, type ShareIntent } from "../lib/shareModel";
import type { ShareCardData, ShareCardRendererOptions } from "../lib/shareImageRenderer";
import type { ResolvedTheme } from "../themes";
import { getShareCard } from "./shareCard";

export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

export interface ShareLinkOptions {
  baseUrl?: string;
  render?: ShareCardRendererOptions;
  file?: { name?: string; type?: string };
}

export interface ShareText {
  title: string;
  text: string;
}

function defaultBaseUrl(): string {
  if (typeof globalThis.location === "undefined") return import.meta.env.BASE_URL;
  return `${globalThis.location.origin}${import.meta.env.BASE_URL}`;
}

export function shareUrl(intent: ShareIntent, baseUrl: string = defaultBaseUrl()): string {
  return buildShareUrl(baseUrl, intent);
}

export function shareFileName(intent: ShareIntent): string {
  return `nasta-${intent.kind}.png`;
}

export function shareTitleText(intent: ShareIntent, data: ShareCardData): ShareText {
  if (data.kind === "journey") {
    return { title: `${data.originLabel} → ${data.destLabel}`, text: `${data.originLabel} → ${data.destLabel}` };
  }
  return { title: `${data.line} ${data.destination}`, text: `${data.labels.departs} ${data.stop}` };
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof navigator.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [new File([new Uint8Array([1])], "probe.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Share a card. Uses file share when the platform supports it; otherwise falls
 * back to a plain text + URL share. Returns 'unsupported' when Web Share is
 * not available at all so the caller can fall back to copying the link.
 */
export async function shareIntent(
  intent: ShareIntent,
  data: ShareCardData,
  theme: ResolvedTheme,
  opts: ShareLinkOptions = {},
): Promise<ShareOutcome> {
  const url = shareUrl(intent, opts.baseUrl);
  const { title, text } = shareTitleText(intent, data);

  if (canShareFiles()) {
    const card = await getShareCard(data, theme, opts.render);
    if (card) {
      const file = new File([card.blob], opts.file?.name ?? shareFileName(intent), {
        type: opts.file?.type ?? "image/png",
      });
      try {
        await navigator.share({ files: [file], title, text, url });
        return "shared";
      } catch (err) {
        if (isAbortError(err)) return "cancelled";
        // Any other failure: try the text + URL fallback.
      }
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      return isAbortError(err) ? "cancelled" : "failed";
    }
  }

  return "unsupported";
}

export async function copyShareLink(intent: ShareIntent, opts: ShareLinkOptions = {}): Promise<boolean> {
  const url = shareUrl(intent, opts.baseUrl);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    return false;
  }

  // Legacy fallback for browsers without the async clipboard API.
  try {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
