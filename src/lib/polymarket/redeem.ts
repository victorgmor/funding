import type { BuilderConfig } from "@polymarket/builder-signing-sdk";
import {
  RelayClient,
  type DepositWalletCall,
} from "@polymarket/builder-relayer-client";
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  zeroHash,
  type Address,
  type WalletClient,
} from "viem";
import { polygon } from "wagmi/chains";
import {
  CONDITIONAL_TOKENS,
  CTF_COLLATERAL_ADAPTER,
  CTF_REDEMPTION_OPERATORS,
  NEG_RISK_COLLATERAL_ADAPTER,
} from "@/lib/polymarket/polygon-contracts";
import { PUSD_ADDRESS } from "@/lib/polygon/usdc";
import { readPusdBalanceWei } from "@/lib/polymarket/deposit-balance";
import { executeDepositWalletBatch } from "@/lib/polymarket/relay-batch";

const RELAYER_URL = "https://relayer-v2.polymarket.com";

const erc1155Abi = [
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
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const redeemAbi = [
  {
    name: "redeemPositions",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSets", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(
    process.env.POLYGON_RPC_URL?.trim() ||
      "https://polygon-bor-rpc.publicnode.com",
  ),
});

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export async function readOutcomeTokenBalance(
  depositAddress: Address,
  tokenId: string,
): Promise<bigint> {
  return publicClient.readContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155Abi,
    functionName: "balanceOf",
    args: [depositAddress, BigInt(tokenId)],
  });
}

function redeemCall(
  negRisk: boolean,
  conditionId: `0x${string}`,
): DepositWalletCall {
  const adapter = negRisk ? NEG_RISK_COLLATERAL_ADAPTER : CTF_COLLATERAL_ADAPTER;
  return {
    target: adapter,
    value: "0",
    data: encodeFunctionData({
      abi: redeemAbi,
      functionName: "redeemPositions",
      args: [PUSD_ADDRESS, zeroHash, conditionId, [1n, 2n]],
    }),
  };
}

function approvalCall(operator: Address): DepositWalletCall {
  return {
    target: CONDITIONAL_TOKENS,
    value: "0",
    data: encodeFunctionData({
      abi: erc1155Abi,
      functionName: "setApprovalForAll",
      args: [operator, true],
    }),
  };
}

async function missingRedemptionApprovals(
  depositAddress: Address,
): Promise<DepositWalletCall[]> {
  const calls: DepositWalletCall[] = [];

  for (const operator of CTF_REDEMPTION_OPERATORS) {
    const approved = await publicClient.readContract({
      address: CONDITIONAL_TOKENS,
      abi: erc1155Abi,
      functionName: "isApprovedForAll",
      args: [depositAddress, operator],
    });
    if (!approved) calls.push(approvalCall(operator));
  }

  return calls;
}

export async function submitResolvedPositionRedemption(
  walletClient: WalletClient,
  depositAddress: Address,
  builderConfig: BuilderConfig,
  input: {
    conditionId: `0x${string}`;
    negRisk: boolean;
  },
): Promise<number> {
  const calls = [
    ...(await missingRedemptionApprovals(depositAddress)),
    redeemCall(input.negRisk, input.conditionId),
  ];

  const balanceBefore = await readPusdBalanceWei(depositAddress);
  const relayer = new RelayClient(
    RELAYER_URL,
    polygon.id,
    walletClient,
    builderConfig,
  );

  const deadline = Math.floor(Date.now() / 1000 + 600).toString();
  await executeDepositWalletBatch(relayer, calls, depositAddress, deadline);

  const balanceAfter = await readPusdBalanceWei(depositAddress);
  const proceedsWei = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n;
  return round(Number(formatUnits(proceedsWei, 6)), 2);
}
