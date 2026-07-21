import { useCallback, useEffect, useState } from "react";
import { useLocalDisplayName } from "@/lib/useLocalDisplayName";
import { isAddressDisplayFallback } from "@/lib/polymarket/profile";

export type PolymarketProfileView = {
  name: string | null;
  verified: boolean;
  loading: boolean;
};

const POLL_FALLBACK_MS = 15_000;
const POLL_SETTLED_MS = 60_000;

export function usePolymarketProfile(
  address: string | undefined,
): PolymarketProfileView {
  const [state, setState] = useState<PolymarketProfileView>({
    name: null,
    verified: false,
    loading: false,
  });
  const localName = useLocalDisplayName(address, "");

  const fetchProfile = useCallback(async () => {
    if (!address) {
      setState({ name: null, verified: false, loading: false });
      return;
    }

    setState((current) => ({ ...current, loading: !current.name }));
    try {
      const res = await fetch(
        `/api/polymarket/profile?address=${encodeURIComponent(address)}`,
      );
      const data = await res.json();
      if (!res.ok) return;
      setState({
        name: data.name ?? null,
        verified: Boolean(data.verified),
        loading: false,
      });
    } catch {
      setState((current) => ({ ...current, loading: false }));
    }
  }, [address]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!address) return;

    const refresh = () => {
      void fetchProfile();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [address, fetchProfile]);

  useEffect(() => {
    if (!address) return;

    const waitingForUsername =
      !state.name || isAddressDisplayFallback(state.name, address);
    const intervalMs = waitingForUsername ? POLL_FALLBACK_MS : POLL_SETTLED_MS;

    const id = window.setInterval(() => {
      void fetchProfile();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [address, state.name, fetchProfile]);

  return {
    ...state,
    name: localName || state.name,
  };
}
