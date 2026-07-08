import { useEffect, useState } from "react";
import type { FundInvestment } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  fundSlug: string;
  variant?: "title" | "tab" | "row";
};

function Badge({ variant }: { variant: "title" | "tab" | "row" }) {
  if (variant === "row") {
    return (
      <span
        className="inline-block size-2 shrink-0 rounded-full bg-emerald-400 ring-2 ring-emerald-400/25"
        title="You have a position in this fund"
        aria-label="Invested"
      />
    );
  }

  const className =
    variant === "title"
      ? "rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-300"
      : "ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-emerald-300";

  return <span className={className}>Invested</span>;
}

export default function InvestedBadge({ fundSlug, variant = "title" }: Props) {
  const { invested } = useFundInvestment(fundSlug);
  if (!invested) return null;
  return <Badge variant={variant} />;
}

export function useFundInvestment(fundSlug: string, refreshKey = 0) {
  const { address, isConnected } = useWalletSession();
  const [invested, setInvested] = useState(false);
  const [investment, setInvestment] = useState<FundInvestment | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setInvested(false);
      setInvestment(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/funds/${fundSlug}/invested?address=${address}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setInvested(false);
          setInvestment(null);
          return;
        }
        setInvested(Boolean(data.invested));
        setInvestment(data.investment ?? null);
      } catch {
        if (!cancelled) {
          setInvested(false);
          setInvestment(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fundSlug, address, isConnected, refreshKey]);

  return { invested, investment, loading };
}

/** @deprecated use useFundInvestment().invested */
export function useFundInvested(fundSlug: string, refreshKey = 0) {
  return useFundInvestment(fundSlug, refreshKey).invested;
}
