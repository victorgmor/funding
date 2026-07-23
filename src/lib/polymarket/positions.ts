import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  fallback,
  getCreate2Address,
  http,
  keccak256,
  pad,
  toHex,
  zeroAddress,
  type Address,
} from "viem";
import { polygon } from "wagmi/chains";
import { fetchSafeAddress } from "@/lib/polymarket/relayer";

const DEPOSIT_FACTORY = "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07";
const DEPOSIT_IMPLEMENTATION = "0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB";
const BEACON_SELECTOR = "0x49493a4d";

const ERC1967_CONST1 =
  "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3";
const ERC1967_CONST2 =
  "0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076";
const ERC1967_PREFIX = 0x61003d3d8160233d3973n;
const ERC1967_BEACON_CONST1 =
  "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3";
const ERC1967_BEACON_CONST2 =
  "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c";
const ERC1967_BEACON_CONST3 =
  "0x60195155f3363d3d373d3d363d602036600436635c60da";
const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;

// Explicit RPCs — viem's default (polygon.drpc.org) blocks eth_call.
const publicClient = createPublicClient({
  chain: polygon,
  transport: fallback([
    http("https://polygon-bor-rpc.publicnode.com"),
    http("https://polygon-rpc.com"),
    http("https://1rpc.io/matic"),
  ]),
});

function depositWalletArgs(owner: Address, factory: Address) {
  const walletId = pad(owner, { dir: "left", size: 32 });
  return encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [factory, walletId],
  );
}

function initCodeHashERC1967(implementation: Address, args: `0x${string}`) {
  const n = BigInt((args.length - 2) / 2);
  const combined = ERC1967_PREFIX + (n << 56n);
  return keccak256(
    concat([
      toHex(combined, { size: 10 }),
      implementation,
      "0x6009",
      ERC1967_CONST2,
      ERC1967_CONST1,
      args,
    ]),
  );
}

function initCodeHashERC1967Beacon(beacon: Address, args: `0x${string}`) {
  const n = BigInt((args.length - 2) / 2);
  const combined = ERC1967_BEACON_PREFIX + (n << 56n);
  return keccak256(
    concat([
      toHex(combined, { size: 10 }),
      beacon,
      ERC1967_BEACON_CONST3,
      ERC1967_BEACON_CONST2,
      ERC1967_BEACON_CONST1,
      args,
    ]),
  );
}

function deriveUupsDepositWallet(owner: Address): Address {
  const args = depositWalletArgs(owner, DEPOSIT_FACTORY as Address);
  const salt = keccak256(args);
  const bytecodeHash = initCodeHashERC1967(
    DEPOSIT_IMPLEMENTATION as Address,
    args,
  );
  return getCreate2Address({
    from: DEPOSIT_FACTORY as Address,
    salt,
    bytecodeHash,
  });
}

function deriveBeaconDepositWallet(owner: Address, beacon: Address): Address {
  const args = depositWalletArgs(owner, DEPOSIT_FACTORY as Address);
  const salt = keccak256(args);
  const bytecodeHash = initCodeHashERC1967Beacon(beacon, args);
  return getCreate2Address({
    from: DEPOSIT_FACTORY as Address,
    salt,
    bytecodeHash,
  });
}

function decodeBeacon(data?: `0x${string}`): Address {
  if (!data || data.length < 66) return zeroAddress;
  return `0x${data.slice(-40)}` as Address;
}

export async function deriveDepositWalletAddress(
  owner: Address,
): Promise<Address> {
  const uups = deriveUupsDepositWallet(owner);

  try {
    const { data } = await publicClient.call({
      to: DEPOSIT_FACTORY as Address,
      data: BEACON_SELECTOR,
    });
    const beacon = decodeBeacon(data);
    if (beacon === zeroAddress) return uups;

    const uupsCode = await publicClient.getCode({ address: uups });
    if (uupsCode && uupsCode !== "0x") return uups;

    return deriveBeaconDepositWallet(owner, beacon);
  } catch {
    return uups;
  }
}

async function fetchSafeAddressForOwner(owner: Address): Promise<Address | null> {
  return fetchSafeAddress(owner);
}

/** Wallets that may hold Polymarket positions for this EOA. */
export async function resolvePositionWallets(
  owner: Address,
): Promise<Address[]> {
  const [deposit, safe] = await Promise.all([
    deriveDepositWalletAddress(owner),
    fetchSafeAddressForOwner(owner),
  ]);

  const seen = new Set<string>();
  const out: Address[] = [];
  for (const addr of [deposit, safe, owner]) {
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}
