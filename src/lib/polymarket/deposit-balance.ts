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

/** pUSD/USDC/bridged-USDC at an exact address (no deposit derivation). */
export async function readCollateralAtAddressUsdc(
  holder: Address,
): Promise<number> {
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

/** Spendable pUSD/USDC on the derived Polymarket deposit wallet only. */
export async function readDepositWalletBalanceUsdc(
  owner: Address,
): Promise<number> {
  const deposit = await deriveDepositWalletAddress(owner);
  return readCollateralAtAddressUsdc(deposit);
}

/** pUSD/USDC sitting on the Privy EOA (not yet in the deposit wallet). */
export async function readOwnerCollateralBalanceUsdc(
  owner: Address,
): Promise<number> {
  return readCollateralAtAddressUsdc(owner);
}

/**
 * Live capital for an investor for Account display.
 * Prefer the owner/proxy balance when non-zero (matches Account screenshots);
 * otherwise the derived deposit wallet. Do not sum Safe+EOA.
 */
export async function readInvestorCollateralUsdc(
  owner: Address,
): Promise<number> {
  const onOwner = await readCollateralAtAddressUsdc(owner);
  if (onOwner >= 0.01) return onOwner;
  return readDepositWalletBalanceUsdc(owner);
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
