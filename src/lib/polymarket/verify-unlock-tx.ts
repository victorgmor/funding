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

export async function verifyUnlockPayment(
  txHash: Hash,
  recipient: Address,
  amountUsdc: number,
): Promise<boolean> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return false;

  const needed = parseUnits(amountUsdc.toFixed(6), 6);
  let total = 0n;
  const to = recipient.toLowerCase();

  for (const log of receipt.logs) {
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

  return total >= needed;
}
