import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getCreate2Address,
  hashTypedData,
  hexToBigInt,
  http,
  keccak256,
  parseUnits,
  toBytes,
  toHex,
  zeroAddress,
  type Address,
  type WalletClient,
} from "viem";
import { polygon } from "wagmi/chains";
import { fetchRelayer, fetchSafeAddress } from "@/lib/polymarket/relayer";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import {
  DEPOSIT_WALLET_DOMAIN_NAME,
  DEPOSIT_WALLET_DOMAIN_VERSION,
  DEPOSIT_WALLET_FACTORY,
  POLYGON_CHAIN_ID,
  PROXY_FACTORY,
  PROXY_INIT_CODE_HASH,
  RELAY_HUB,
  SAFE_INIT_CODE_HASH,
  type GiftWalletKind,
  type NoncePayload,
  type RelayPayload,
} from "@/lib/polymarket/relay-config";
import {
  encodeErc20TransferData,
  GIFT_TOKEN_ADDRESSES,
} from "@/lib/polygon/usdc";

const PROXY_CALL_TYPE = 1;
const DEFAULT_GAS_LIMIT = "10000000";
const OPERATION_CALL = 0;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(),
});

const balanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const proxyFactoryAbi = [
  {
    constant: false,
    inputs: [
      {
        components: [
          { name: "typeCode", type: "uint8" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "proxy",
    outputs: [{ name: "returnValues", type: "bytes[]" }],
    payable: true,
    stateMutability: "payable",
    type: "function",
  },
] as const;

type GiftSource = {
  kind: GiftWalletKind;
  wallet: Address;
  token: Address;
};

function deriveProxyWallet(owner: Address): Address {
  return getCreate2Address({
    bytecodeHash: PROXY_INIT_CODE_HASH,
    from: PROXY_FACTORY,
    salt: keccak256(encodePacked(["address"], [owner])),
  });
}

function splitAndPackSig(sig: `0x${string}`): `0x${string}` {
  let sigV = parseInt(sig.slice(-2), 16);
  switch (sigV) {
    case 0:
    case 1:
      sigV += 31;
      break;
    case 27:
    case 28:
      sigV += 4;
      break;
    default:
      throw new Error("Invalid signature");
  }
  const adjusted = (sig.slice(0, -2) + sigV.toString(16)) as `0x${string}`;
  const r = hexToBigInt(`0x${adjusted.slice(2, 66)}`);
  const s = hexToBigInt(`0x${adjusted.slice(66, 130)}`);
  const v = hexToBigInt(`0x${adjusted.slice(130, 132)}`);
  return encodePacked(["uint256", "uint256", "uint8"], [r, s, Number(v)]);
}

async function erc20Balance(token: Address, holder: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [holder],
  });
}

async function fetchRelayPayload(
  address: Address,
  type: "PROXY",
): Promise<RelayPayload> {
  const res = await fetchRelayer("relay-payload", { address, type });
  const data = (await res.json()) as RelayPayload;
  if (!res.ok) throw new Error("Could not reach Polymarket relayer");
  return data;
}

async function fetchNonce(address: Address, type: string): Promise<string> {
  const res = await fetchRelayer("nonce", { address, type });
  const data = (await res.json()) as NoncePayload;
  if (!res.ok) throw new Error("Could not fetch Polymarket nonce");
  return data.nonce;
}

async function submitRelayRequest(body: unknown): Promise<string> {
  const payload = JSON.stringify(body);
  const res = await fetch("/api/polymarket/relay/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  const data = (await res.json()) as { hash?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Payment submit failed");
  if (!data.hash) throw new Error("Payment submitted but no transaction hash returned");
  return data.hash;
}

function encodeProxyTransactionData(
  transactions: { to: Address; data: `0x${string}`; value: string }[],
): `0x${string}` {
  return encodeFunctionData({
    abi: proxyFactoryAbi,
    functionName: "proxy",
    args: [
      transactions.map((tx) => ({
        typeCode: PROXY_CALL_TYPE,
        to: tx.to,
        value: BigInt(tx.value),
        data: tx.data,
      })),
    ],
  });
}

function createProxyStructHash(
  from: Address,
  to: Address,
  data: `0x${string}`,
  nonce: string,
  relay: Address,
): `0x${string}` {
  return keccak256(
    concat([
      toHex("rlx:"),
      from,
      to,
      data,
      toHex(0n, { size: 32 }),
      toHex(0n, { size: 32 }),
      toHex(BigInt(DEFAULT_GAS_LIMIT), { size: 32 }),
      toHex(BigInt(nonce), { size: 32 }),
      RELAY_HUB,
      relay,
    ]),
  );
}

async function fetchProfileProxyWallet(owner: Address): Promise<string | null> {
  const res = await fetch(`/api/polymarket/profile?address=${owner}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { proxyWallet?: string };
  const proxy = data.proxyWallet?.trim();
  if (proxy && /^0x[a-fA-F0-9]{40}$/i.test(proxy)) return proxy;
  return null;
}

async function pickGiftSource(
  owner: Address,
  amountUsdc: number,
): Promise<GiftSource | null> {
  const needed = parseUnits(amountUsdc.toFixed(6), 6);
  const [deposit, safe, profileWallet] = await Promise.all([
    deriveDepositWalletAddress(owner),
    fetchSafeAddress(owner),
    fetchProfileProxyWallet(owner),
  ]);

  const wallets: { kind: GiftWalletKind; address: Address }[] = [];
  const seen = new Set<string>();

  function add(kind: GiftWalletKind, address: Address) {
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    wallets.push({ kind, address });
  }

  add("deposit", deposit);
  if (profileWallet) {
    add("deposit", profileWallet as Address);
  }
  if (safe) add("safe", safe);
  add("proxy", deriveProxyWallet(owner));

  for (const wallet of wallets) {
    for (const token of GIFT_TOKEN_ADDRESSES) {
      const balance = await erc20Balance(token, wallet.address);
      if (balance >= needed) {
        return { kind: wallet.kind, wallet: wallet.address, token };
      }
    }
  }

  return null;
}

async function sendGiftFromSafe(
  walletClient: WalletClient,
  from: Address,
  safeAddress: Address,
  token: Address,
  recipient: Address,
  amountUsdc: number,
  onStatus?: (message: string) => void,
): Promise<string> {
  const transferData = encodeErc20TransferData(token, recipient, amountUsdc);
  const nonce = await fetchNonce(from, "SAFE");

  onStatus?.("Approve in wallet — simulation warning is normal");

  const structHash = hashTypedData({
    domain: {
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: safeAddress,
    },
    types: {
      SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "SafeTx",
    message: {
      to: token,
      value: 0n,
      data: transferData,
      operation: OPERATION_CALL,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
      nonce: BigInt(nonce),
    },
  });

  const signature = await walletClient.signMessage({
    account: from,
    message: { raw: toBytes(structHash) },
  });

  onStatus?.("Sending from Polymarket…");

  return submitRelayRequest({
    from,
    to: token,
    proxyWallet: safeAddress,
    data: transferData,
    nonce,
    signature: splitAndPackSig(signature),
    signatureParams: {
      gasPrice: "0",
      operation: `${OPERATION_CALL}`,
      safeTxnGas: "0",
      baseGas: "0",
      gasToken: zeroAddress,
      refundReceiver: zeroAddress,
    },
    type: "SAFE",
    metadata: "Bundle unlock",
  });
}

async function sendGiftFromProxy(
  walletClient: WalletClient,
  from: Address,
  token: Address,
  recipient: Address,
  amountUsdc: number,
  onStatus?: (message: string) => void,
): Promise<string> {
  const transferData = encodeErc20TransferData(token, recipient, amountUsdc);
  const proxyData = encodeProxyTransactionData([
    { to: token, data: transferData, value: "0" },
  ]);
  const relay = await fetchRelayPayload(from, "PROXY");
  const structHash = createProxyStructHash(
    from,
    PROXY_FACTORY,
    proxyData,
    relay.nonce,
    relay.address,
  );

  onStatus?.("Approve in wallet — simulation warning is normal");

  const signature = await walletClient.signMessage({
    account: from,
    message: { raw: toBytes(structHash) },
  });

  onStatus?.("Sending from Polymarket…");

  return submitRelayRequest({
    from,
    to: PROXY_FACTORY,
    proxyWallet: deriveProxyWallet(from),
    data: proxyData,
    nonce: relay.nonce,
    signature,
    signatureParams: {
      gasPrice: "0",
      gasLimit: DEFAULT_GAS_LIMIT,
      relayerFee: "0",
      relayHub: RELAY_HUB,
      relay: relay.address,
    },
    type: "PROXY",
    metadata: "Bundle unlock",
  });
}

async function sendGiftFromDepositWallet(
  walletClient: WalletClient,
  from: Address,
  walletAddress: Address,
  token: Address,
  recipient: Address,
  amountUsdc: number,
  onStatus?: (message: string) => void,
): Promise<string> {
  const transferData = encodeErc20TransferData(token, recipient, amountUsdc);
  const nonce = await fetchNonce(from, "WALLET");
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const calls = [{ target: token, value: "0", data: transferData }];

  onStatus?.("Approve in wallet — simulation warning is normal");

  const signature = await walletClient.signTypedData({
    account: from,
    domain: {
      name: DEPOSIT_WALLET_DOMAIN_NAME,
      version: DEPOSIT_WALLET_DOMAIN_VERSION,
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: walletAddress,
    },
    types: {
      Call: [
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
      Batch: [
        { name: "wallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "calls", type: "Call[]" },
      ],
    },
    primaryType: "Batch",
    message: {
      wallet: walletAddress,
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
      calls: calls.map((c) => ({
        target: c.target,
        value: 0n,
        data: c.data,
      })),
    },
  });

  onStatus?.("Sending from Polymarket…");

  return submitRelayRequest({
    type: "WALLET",
    from,
    to: DEPOSIT_WALLET_FACTORY,
    nonce,
    signature,
    depositWalletParams: {
      depositWallet: walletAddress,
      deadline: `${deadline}`,
      calls,
    },
  });
}

export async function sendUsdcFromPolymarketBalance(
  walletClient: WalletClient,
  recipient: Address,
  amountUsdc: number,
  onStatus?: (message: string) => void,
): Promise<string> {
  const from = walletClient.account?.address;
  if (!from) throw new Error("Wallet account unavailable");

  const source = await pickGiftSource(from, amountUsdc);
  if (!source) {
    throw new Error(
      "No Polymarket cash found — your balance may be in open positions",
    );
  }

  switch (source.kind) {
    case "safe":
      return sendGiftFromSafe(
        walletClient,
        from,
        source.wallet,
        source.token,
        recipient,
        amountUsdc,
        onStatus,
      );
    case "deposit":
      return sendGiftFromDepositWallet(
        walletClient,
        from,
        source.wallet,
        source.token,
        recipient,
        amountUsdc,
        onStatus,
      );
    case "proxy":
      return sendGiftFromProxy(
        walletClient,
        from,
        source.token,
        recipient,
        amountUsdc,
        onStatus,
      );
  }
}
