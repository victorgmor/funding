import type { BuilderConfig } from "@polymarket/builder-signing-sdk";
import {
  RelayClient,
  type DepositWalletCall,
} from "@polymarket/builder-relayer-client";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  maxUint256,
  type Address,
  type WalletClient,
} from "viem";
import { polygon } from "wagmi/chains";
import {
  CONDITIONAL_TOKENS,
  PUSD_COLLATERAL_SPENDERS,
} from "@/lib/polymarket/polygon-contracts";
import { PUSD_ADDRESS } from "@/lib/polygon/usdc";

const RELAYER_URL = "https://relayer-v2.polymarket.com";
const APPROVAL_MIN = 1_000_000n;

const erc20ApproveAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const erc1155ApproveAbi = [
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

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(
    process.env.POLYGON_RPC_URL?.trim() ||
      "https://polygon-bor-rpc.publicnode.com",
  ),
});

function erc20ApproveCall(token: Address, spender: Address): DepositWalletCall {
  return {
    target: token,
    value: "0",
    data: encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spender, maxUint256],
    }),
  };
}

function erc1155ApproveCall(operator: Address): DepositWalletCall {
  return {
    target: CONDITIONAL_TOKENS,
    value: "0",
    data: encodeFunctionData({
      abi: erc1155ApproveAbi,
      functionName: "setApprovalForAll",
      args: [operator, true],
    }),
  };
}

async function pusdAllowanceOk(
  depositAddress: Address,
  spender: Address,
): Promise<boolean> {
  const allowance = await publicClient.readContract({
    address: PUSD_ADDRESS,
    abi: erc20ApproveAbi,
    functionName: "allowance",
    args: [depositAddress, spender],
  });
  return allowance >= APPROVAL_MIN;
}

async function ctfApprovedForAll(
  depositAddress: Address,
  operator: Address,
): Promise<boolean> {
  return publicClient.readContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155ApproveAbi,
    functionName: "isApprovedForAll",
    args: [depositAddress, operator],
  });
}

async function buildMissingApprovalCalls(
  depositAddress: Address,
): Promise<DepositWalletCall[]> {
  const calls: DepositWalletCall[] = [];

  for (const spender of PUSD_COLLATERAL_SPENDERS) {
    if (!(await pusdAllowanceOk(depositAddress, spender))) {
      calls.push(erc20ApproveCall(PUSD_ADDRESS, spender));
    }
    if (!(await ctfApprovedForAll(depositAddress, spender))) {
      calls.push(erc1155ApproveCall(spender));
    }
  }

  return calls;
}

export async function submitDepositWalletApprovals(
  walletClient: WalletClient,
  depositAddress: Address,
  builderConfig: BuilderConfig,
  onStatus?: (message: string) => void,
): Promise<void> {
  const calls = await buildMissingApprovalCalls(depositAddress);
  if (calls.length === 0) return;

  onStatus?.("Approving Polymarket trading contracts…");

  const relayer = new RelayClient(
    RELAYER_URL,
    polygon.id,
    walletClient,
    builderConfig,
  );

  const deadline = Math.floor(Date.now() / 1000 + 600).toString();
  const response = await relayer.executeDepositWalletBatch(
    calls,
    depositAddress,
    deadline,
  );
  const confirmed = await response.wait();
  if (!confirmed) {
    throw new Error("Deposit wallet approval failed — try again in a minute");
  }
}
