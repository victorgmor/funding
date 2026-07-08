import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
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
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: USDC_NATIVE_ADDRESS,
        abi: balanceAbi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: USDC_ADDRESS,
        abi: balanceAbi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: { enabled: Boolean(address) },
  });

  const native = data?.[0]?.result ?? 0n;
  const bridged = data?.[1]?.result ?? 0n;
  const total = native + bridged;

  return {
    balanceUsdc: Number(formatUnits(total, 6)),
    loading: isLoading,
    refetch,
  };
}
