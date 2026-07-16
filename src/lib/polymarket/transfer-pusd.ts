import {
  RelayClient,
  type DepositWalletCall,
} from "@polymarket/builder-relayer-client";
import type { BuilderConfig } from "@polymarket/builder-signing-sdk";
import {
  encodeFunctionData,
  parseUnits,
  type Address,
  type WalletClient,
} from "viem";
import { polygon } from "wagmi/chains";
import { getClientRelayBuilderConfig } from "@/lib/polymarket/builder";
import { readPusdBalanceWei } from "@/lib/polymarket/deposit-balance";
import { executeDepositWalletBatch } from "@/lib/polymarket/relay-batch";
import { PUSD_ADDRESS } from "@/lib/polygon/usdc";

const RELAYER_URL = "https://relayer-v2.polymarket.com";

const transferAbi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Move all pUSD from the Privy EOA into the Polymarket deposit wallet. */
export async function transferPusdToDepositWallet(
  walletClient: WalletClient,
  depositAddress: Address,
): Promise<`0x${string}`> {
  const from = walletClient.account?.address;
  if (!from) throw new Error("Wallet account unavailable");

  const amount = await readPusdBalanceWei(from);
  if (amount <= 0n) {
    throw new Error("No pUSD on your Privy wallet to move");
  }

  return walletClient.writeContract({
    chain: walletClient.chain,
    account: from,
    address: PUSD_ADDRESS,
    abi: transferAbi,
    functionName: "transfer",
    args: [depositAddress, amount],
  });
}

async function fetchWithdrawableDepositUsdc(
  ownerAddress: Address,
): Promise<number> {
  const res = await fetch(
    `/api/investor/deposit?address=${encodeURIComponent(ownerAddress)}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not verify withdrawable balance");
  }
  const data = (await res.json()) as { withdrawableUsdc: number };
  return data.withdrawableUsdc;
}

async function submitDepositWalletPusdTransfer(
  walletClient: WalletClient,
  depositAddress: Address,
  ownerAddress: Address,
  builderConfig: BuilderConfig,
): Promise<void> {
  const [balanceWei, withdrawableUsdc] = await Promise.all([
    readPusdBalanceWei(depositAddress),
    fetchWithdrawableDepositUsdc(ownerAddress),
  ]);

  if (withdrawableUsdc <= 0) {
    throw new Error(
      "No withdrawable pUSD — committed funds stay locked until funds close",
    );
  }

  const maxWei = parseUnits(withdrawableUsdc.toFixed(6), 6);
  const amount = balanceWei < maxWei ? balanceWei : maxWei;
  if (amount <= 0n) {
    throw new Error("No pUSD in your deposit wallet to move");
  }

  const call: DepositWalletCall = {
    target: PUSD_ADDRESS,
    value: "0",
    data: encodeFunctionData({
      abi: transferAbi,
      functionName: "transfer",
      args: [ownerAddress, amount],
    }),
  };

  const relayer = new RelayClient(
    RELAYER_URL,
    polygon.id,
    walletClient,
    builderConfig,
  );
  const deadline = Math.floor(Date.now() / 1000 + 600).toString();
  await executeDepositWalletBatch(relayer, [call], depositAddress, deadline);
}

/** Move all pUSD from the Polymarket deposit wallet back to the Privy EOA. */
export async function transferPusdFromDepositWallet(
  walletClient: WalletClient,
  depositAddress: Address,
  ownerAddress: Address,
): Promise<void> {
  const builderConfig = getClientRelayBuilderConfig();
  if (!builderConfig) {
    throw new Error(
      "Polymarket builder keys not configured — deposit wallet transfers unavailable",
    );
  }

  await submitDepositWalletPusdTransfer(
    walletClient,
    depositAddress,
    ownerAddress,
    builderConfig,
  );
}
