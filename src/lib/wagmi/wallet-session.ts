const KEY = "carriera:wallet-session";

type Session = {
  address: string;
};

export const WAGMI_ACCOUNT_EVENT = "carriera:wagmi-account";

export function readWalletSession(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Session;
    const address = data.address?.toLowerCase();
    if (!address || !/^0x[a-f0-9]{40}$/.test(address)) return null;
    return address as `0x${string}`;
  } catch {
    return null;
  }
}

export function writeWalletSession(address: string | undefined) {
  if (typeof window === "undefined") return;
  if (!address) {
    window.localStorage.removeItem(KEY);
    delete document.documentElement.dataset.walletSession;
    return;
  }
  const normalized = address.toLowerCase();
  window.localStorage.setItem(KEY, JSON.stringify({ address: normalized }));
  document.documentElement.dataset.walletSession = "1";
}
