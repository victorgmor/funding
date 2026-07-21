import { useEffect, useState } from "react";
import {
  LOCAL_PROFILE_UPDATED_EVENT,
  localDisplayName,
} from "@/lib/local-profile";

/** Prefers localStorage username for this address; falls back otherwise. */
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
    const refresh = () => setName(localDisplayName(address) ?? fallback);
    refresh();
    window.addEventListener(LOCAL_PROFILE_UPDATED_EVENT, refresh);
    return () =>
      window.removeEventListener(LOCAL_PROFILE_UPDATED_EVENT, refresh);
  }, [address, fallback]);

  return name;
}
