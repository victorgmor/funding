import type { Address, WalletClient } from "viem";
import { readPusdBalanceWei } from "@/lib/polymarket/deposit-balance";
import { PUSD_ADDRESS } from "@/lib/polygon/usdc";

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
