import {
  encodeFunctionData,
  parseUnits,
  type Address,
} from "viem";

export const USDC_ADDRESS =
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

/** Native USDC on Polygon. */
export const USDC_NATIVE_ADDRESS =
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

/** Polymarket cash token (1:1 with USDC). */
export const PUSD_ADDRESS =
  "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB" as const;

export const GIFT_TOKEN_ADDRESSES = [
  PUSD_ADDRESS,
  USDC_NATIVE_ADDRESS,
  USDC_ADDRESS,
] as const;

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

export function encodeErc20TransferData(
  token: Address,
  to: Address,
  amountUsdc: number,
): `0x${string}` {
  return encodeFunctionData({
    abi: transferAbi,
    functionName: "transfer",
    args: [to, parseUnits(amountUsdc.toFixed(6), 6)],
  });
}
