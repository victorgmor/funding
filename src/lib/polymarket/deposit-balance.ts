import { createPublicClient, formatUnits, http, type Address } from "viem";
import { polygon } from "wagmi/chains";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import { GIFT_TOKEN_ADDRESSES } from "@/lib/polygon/usdc";

const balanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(),
});

async function tokenBalance(token: Address, holder: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [holder],
  });
}

/** Spendable pUSD/USDC on the investor's Polymarket deposit wallet. */
export async function readDepositWalletBalanceUsdc(
  owner: Address,
): Promise<number> {
  const deposit = await deriveDepositWalletAddress(owner);
  let total = 0n;

  for (const token of GIFT_TOKEN_ADDRESSES) {
    total += await tokenBalance(token, deposit);
  }

  return round(Number(formatUnits(total, 6)), 2);
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
