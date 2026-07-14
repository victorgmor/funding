import {
  RelayClient,
  buildDepositWalletCreateRequest,
  ClientRelayerTransactionResponse,
} from "@polymarket/builder-relayer-client";
import type { Address, WalletClient } from "viem";
import { polygon } from "wagmi/chains";

const RELAYER_URL = "https://relayer-v2.polymarket.com";

async function fetchDeployed(address: string): Promise<boolean> {
  const params = new URLSearchParams({ address, type: "WALLET" });
  const url =
    typeof window !== "undefined"
      ? `/api/polymarket/relayer/deployed?${params}`
      : `${RELAYER_URL}/deployed?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Could not check deposit wallet (${res.status})`);
  }
  const data = (await res.json()) as { deployed?: boolean };
  return !!data.deployed;
}

export async function isDepositWalletDeployed(
  depositAddress: Address,
): Promise<boolean> {
  return fetchDeployed(depositAddress);
}

async function submitRelayerTransaction(request: unknown) {
  const res = await fetch("/api/polymarket/relayer/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    transactionID?: string;
    state?: string;
    transactionHash?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Deposit wallet setup failed (${res.status})`);
  }
  return data;
}

export async function ensureDepositWallet(
  walletClient: WalletClient,
  onStatus?: (message: string) => void,
): Promise<Address> {
  const relayer = new RelayClient(RELAYER_URL, polygon.id, walletClient);
  const address = (await relayer.deriveDepositWalletAddress()) as Address;

  const deployed = await fetchDeployed(address);
  if (!deployed) {
    onStatus?.("Creating your Polymarket deposit wallet…");
    const from = walletClient.account?.address;
    if (!from) throw new Error("Wallet account unavailable");

    const config = relayer.contractConfig.DepositWalletContracts;
    const request = buildDepositWalletCreateRequest(from, config);
    const resp = await submitRelayerTransaction(request);
    if (!resp.transactionID) {
      throw new Error("Deposit wallet setup failed — no transaction id");
    }

    const txResponse = new ClientRelayerTransactionResponse(
      resp.transactionID,
      resp.state ?? "",
      resp.transactionHash ?? "",
      relayer,
    );
    const confirmed = await txResponse.wait();
    if (!confirmed) {
      throw new Error(
        "Deposit wallet setup failed — try again in a minute or log in at polymarket.com first",
      );
    }
  }

  return address;
}
