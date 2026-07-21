import { useEffect, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import { fetchPolymarketWalletInfo } from "@/lib/polymarket/wallet-info";
import type { Address } from "viem";

type Props = {
  address: string;
};

export default function CreatorDepositBalance({ address }: Props) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await fetchPolymarketWalletInfo(address as Address);
        if (!cancelled) setBalance(info.depositCollateral);
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="border-primary/10 mt-4 border-t pt-4">
      <p className="text-primary/45 text-xs font-medium tracking-wide uppercase">
        Deposit balance
      </p>
      <p className="text-primary mt-1 font-mono text-sm tabular-nums">
        {balance == null ? "…" : `${formatUsdExact(balance)} pUSD`}
      </p>
    </div>
  );
}
