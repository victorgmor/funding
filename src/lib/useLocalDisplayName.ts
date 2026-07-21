import { useEffect, useState } from "react";
import {
  LOCAL_PROFILE_UPDATED_EVENT,
  localDisplayName,
} from "@/lib/local-profile";

/** Prefers local cache, then Dynamo manager profile, then fallback. */
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
      try {
        const res = await fetch(
          `/api/polymarket/profile?address=${encodeURIComponent(address)}`,
        );
        const data = (await res.json()) as { name?: string | null };
        if (cancelled || !res.ok) return;
        const next = localDisplayName(address) || data.name?.trim() || fallback;
        setName(next);
      } catch {
        // keep local / fallback
      }
    })();

    window.addEventListener(LOCAL_PROFILE_UPDATED_EVENT, refreshLocal);
    return () => {
      cancelled = true;
      window.removeEventListener(LOCAL_PROFILE_UPDATED_EVENT, refreshLocal);
    };
  }, [address, fallback]);

  return name;
}
