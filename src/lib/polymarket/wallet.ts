import { SignatureTypeV2, type ClobClient } from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";
import { ensureDepositWalletApprovals } from "@/lib/polymarket/deposit-approvals";
import { ensureDepositWallet } from "@/lib/polymarket/depositWallet";

export type TradingWallet = {
  signatureType: SignatureTypeV2;
  funderAddress: string;
  depositAddress: string;
};

export async function resolveTradingWallet(
  walletClient: WalletClient,
  onStatus?: (message: string) => void,
): Promise<TradingWallet> {
  const depositAddress = await ensureDepositWallet(walletClient, onStatus);
  await ensureDepositWalletApprovals(walletClient, depositAddress, onStatus);

  return {
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositAddress,
    depositAddress,
  };
}

export async function getApiCredentials(client: ClobClient) {
  try {
    const derived = await client.deriveApiKey();
    if (derived?.key) return derived;
  } catch {
    /* new user — create below */
  }

  try {
    const created = await client.createApiKey();
    if (created?.key) return created;
  } catch (e) {
    throw new Error(formatApiKeyError(e));
  }

  throw new Error(formatApiKeyError(new Error("Could not create api key")));
}

function formatApiKeyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Could not create api key";
  const lower = raw.toLowerCase();

  if (lower.includes("reject") || lower.includes("denied")) {
    return "Signature rejected — approve the Polymarket login request in your wallet";
  }

  if (lower.includes("could not create api key")) {
    return "Polymarket login failed — log in at polymarket.com with this wallet, then try again";
  }

  return raw;
}
