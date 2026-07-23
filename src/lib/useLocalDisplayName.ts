import { useEffect, useState } from "react";
import {
  LOCAL_PROFILE_UPDATED_EVENT,
  localDisplayName,
} from "@/lib/local-profile";
import { fetchClientPolymarketProfile } from "@/lib/polymarket/profile-client";

/** Prefers local cache, then Dynamo/Polymarket profile API, then fallback. */
export function useLocalDisplayName(
  address: string | undefined,
  fallback = "",
): string {
  const [name, setName] = useState(fallback);

  useEffect(() => {
    if (!address) {
      setName(fallback);
      return;
    }

    const refreshLocal = () =>
      setName(localDisplayName(address) ?? fallback);

    refreshLocal();

    let cancelled = false;
    void (async () => {
      const data = await fetchClientPolymarketProfile(address);
      if (cancelled || !data) return;
      setName(localDisplayName(address) || data.name?.trim() || fallback);
    })();

    window.addEventListener(LOCAL_PROFILE_UPDATED_EVENT, refreshLocal);
    return () => {
      cancelled = true;
      window.removeEventListener(LOCAL_PROFILE_UPDATED_EVENT, refreshLocal);
    };
  }, [address, fallback]);

  return name;
}
