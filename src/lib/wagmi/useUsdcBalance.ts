import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { readContracts } from "@wagmi/core";
import { wagmiConfig } from "@/lib/wagmi/config";
import { USDC_ADDRESS, USDC_NATIVE_ADDRESS } from "@/lib/polygon/usdc";

const balanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function useUsdcBalance(address?: `0x${string}`) {
  const [balanceUsdc, setBalanceUsdc] = useState(0);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!address) {
      setBalanceUsdc(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await readContracts(wagmiConfig, {
        contracts: [
          {
            address: USDC_NATIVE_ADDRESS,
            abi: balanceAbi,
            functionName: "balanceOf",
            args: [address],
          },
          {
            address: USDC_ADDRESS,
            abi: balanceAbi,
            functionName: "balanceOf",
            args: [address],
          },
        ],
      });

      const native = data[0]?.result ?? 0n;
      const bridged = data[1]?.result ?? 0n;
      setBalanceUsdc(Number(formatUnits(native + bridged, 6)));
    } catch {
      setBalanceUsdc(0);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refetch();
    if (!address) return;
    const id = window.setInterval(() => void refetch(), 30_000);
    return () => window.clearInterval(id);
  }, [address, refetch]);

  return { balanceUsdc, loading, refetch };
}
