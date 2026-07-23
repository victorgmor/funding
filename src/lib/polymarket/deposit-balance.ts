import { createPublicClient, fallback, formatUnits, http, type Address } from "viem";
import { polygon } from "wagmi/chains";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import { CONDITIONAL_TOKENS } from "@/lib/polymarket/polygon-contracts";
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

const erc1155BalanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function polygonTransport() {
  const urls = [
    process.env.POLYGON_RPC_URL?.trim(),
    "https://polygon-bor.publicnode.com",
    "https://rpc.ankr.com/polygon",
    "https://1rpc.io/matic",
    "https://polygon-rpc.com",
  ].filter(Boolean) as string[];

  return fallback(urls.map((url) => http(url, { timeout: 8_000 })));
}

const publicClient = createPublicClient({
  chain: polygon,
  transport: polygonTransport(),
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

/** Outcome-token shares held by an address (CTF ERC-1155, 6 decimals). */
export async function readConditionalShares(
  holder: Address,
  tokenId: string,
): Promise<number> {
  const wei = await publicClient.readContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155BalanceAbi,
    functionName: "balanceOf",
    args: [holder, BigInt(tokenId)],
  });
  // Round down so a sell never exceeds the on-chain balance.
  return Math.floor(Number(formatUnits(wei, 6)) * 1e4) / 1e4;
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
 * Live capital for an investor for Account / mandate display.
 * Prefer the wallet that actually holds funds (EOA vs derived deposit).
 */
export async function readInvestorCollateralUsdc(
  owner: Address,
): Promise<number> {
  const deposit = await deriveDepositWalletAddress(owner);
  const [onOwner, onDeposit] = await Promise.all([
    readCollateralAtAddressUsdc(owner).catch(() => 0),
    readCollateralAtAddressUsdc(deposit).catch(() => 0),
  ]);
  return Math.max(onOwner, onDeposit);
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
