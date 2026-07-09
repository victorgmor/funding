import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbiItem,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { polygon } from "wagmi/chains";
import { GIFT_TOKEN_ADDRESSES } from "@/lib/polygon/usdc";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(),
});

const tokenSet = new Set(
  GIFT_TOKEN_ADDRESSES.map((address) => address.toLowerCase()),
);

export type UnlockPaymentVerification = {
  creator: Address;
  creatorAmount: number;
  commission?: { recipient: Address; amount: number } | null;
};

function sumTransfersTo(
  logs: Awaited<
    ReturnType<typeof publicClient.getTransactionReceipt>
  >["logs"],
  recipient: Address,
): bigint {
  const to = recipient.toLowerCase();
  let total = 0n;

  for (const log of logs) {
    if (!tokenSet.has(log.address.toLowerCase())) continue;
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const { to: dest, value } = decoded.args;
      if (dest.toLowerCase() === to) total += value;
    } catch {
      continue;
    }
  }

  return total;
}

export async function verifyUnlockPayment(
  txHash: Hash,
  payouts: UnlockPaymentVerification,
): Promise<boolean> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return false;

  const creatorNeeded = parseUnits(payouts.creatorAmount.toFixed(6), 6);
  if (sumTransfersTo(receipt.logs, payouts.creator) < creatorNeeded) {
    return false;
  }

  if (payouts.commission && payouts.commission.amount > 0) {
    const commissionNeeded = parseUnits(
      payouts.commission.amount.toFixed(6),
      6,
    );
    if (
      sumTransfersTo(receipt.logs, payouts.commission.recipient) <
      commissionNeeded
    ) {
      return false;
    }
  }

  return true;
}
