import { useEffect, useState } from "react";
import type { Mandate } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

export function useMandate(fundSlug: string, refreshKey = 0) {
  const { address } = useWalletSession();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [mandateValueUsdc, setMandateValueUsdc] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setMandate(null);
      setMandateValueUsdc(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/funds/${fundSlug}/mandates?address=${encodeURIComponent(address)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Load failed");
        setMandate(data.mandate ?? null);
        setMandateValueUsdc(
          typeof data.mandateValueUsdc === "number"
            ? data.mandateValueUsdc
            : null,
        );
      } catch {
        if (!cancelled) {
          setMandate(null);
          setMandateValueUsdc(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fundSlug, address, refreshKey]);

  const committed = (mandate?.notionalUsdc ?? 0) > 0;

  return { mandate, mandateValueUsdc, committed, loading };
}
