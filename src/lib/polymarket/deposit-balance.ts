import { createPublicClient, formatUnits, http, type Address } from "viem";
import { polygon } from "wagmi/chains";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import { GIFT_TOKEN_ADDRESSES, PUSD_ADDRESS } from "@/lib/polygon/usdc";

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

async function readCollateralBalanceUsdc(holder: Address): Promise<number> {
  let total = 0n;
  for (const token of GIFT_TOKEN_ADDRESSES) {
    total += await tokenBalance(token, holder);
  }
  return round(Number(formatUnits(total, 6)), 2);
}

/** pUSD balance at an address (6 decimals). */
export async function readPusdBalanceWei(holder: Address): Promise<bigint> {
  return tokenBalance(PUSD_ADDRESS, holder);
}

export async function readPusdBalanceUsdc(holder: Address): Promise<number> {
  const wei = await readPusdBalanceWei(holder);
  return round(Number(formatUnits(wei, 6)), 2);
}

/** Spendable pUSD/USDC on the investor's Polymarket deposit wallet. */
export async function readDepositWalletBalanceUsdc(
  owner: Address,
): Promise<number> {
  const deposit = await deriveDepositWalletAddress(owner);
  return readCollateralBalanceUsdc(deposit);
}

/** pUSD/USDC sitting on the Privy EOA (not yet in the deposit wallet). */
export async function readOwnerCollateralBalanceUsdc(
  owner: Address,
): Promise<number> {
  return readCollateralBalanceUsdc(owner);
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
