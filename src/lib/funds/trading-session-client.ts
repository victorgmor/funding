import type { StoredClobCreds } from "@/lib/funds/trading-sessions";

const PREFIX = "carriera-trading-session";

function storageKey(fundSlug: string, wallet: string) {
  return `${PREFIX}:${fundSlug}:${wallet.toLowerCase()}`;
}

export function readLocalTradingCreds(
  fundSlug: string,
  wallet: string,
): StoredClobCreds | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const raw = localStorage.getItem(storageKey(fundSlug, wallet));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredClobCreds;
  } catch {
    return undefined;
  }
}

export function saveLocalTradingCreds(
  fundSlug: string,
  wallet: string,
  creds: StoredClobCreds,
) {
  localStorage.setItem(storageKey(fundSlug, wallet), JSON.stringify(creds));
}

export function clearLocalTradingCreds(fundSlug: string, wallet: string) {
  localStorage.removeItem(storageKey(fundSlug, wallet));
}
