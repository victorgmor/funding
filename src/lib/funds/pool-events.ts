export const POOL_UPDATED_EVENT = "carriera:pool-updated";

export function notifyPoolUpdated(fundSlug?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(POOL_UPDATED_EVENT, { detail: { fundSlug } }),
  );
}
