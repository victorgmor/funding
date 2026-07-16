import type { Address } from "viem";
import { polygon } from "wagmi/chains";
import { encodeErc20TransferData, PUSD_ADDRESS } from "@/lib/polygon/usdc";

export function buildPusdTransferRequest(to: Address, amountUsdc: number) {
  return {
    to: PUSD_ADDRESS,
    data: encodeErc20TransferData(PUSD_ADDRESS, to, amountUsdc),
    value: 0n,
    chainId: polygon.id,
  };
}
