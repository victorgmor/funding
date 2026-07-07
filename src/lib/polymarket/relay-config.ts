import type { Address } from "viem";

export const RELAYER_URL = "https://relayer-v2.polymarket.com";
export const POLYGON_CHAIN_ID = 137;

export const PROXY_FACTORY =
  "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052" as const;
export const RELAY_HUB =
  "0xD216153c06E857cD7f72665E0aF1d7D82172F494" as const;
export const PROXY_INIT_CODE_HASH =
  "0xd21df8dc65880a8606f09fe0ce3df9b8869287ab0b058be05aa9e8af6330a00b" as const;

export const SAFE_FACTORY =
  "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b" as const;
export const SAFE_INIT_CODE_HASH =
  "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf" as const;

export const DEPOSIT_WALLET_FACTORY =
  "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07" as const;
export const DEPOSIT_WALLET_DOMAIN_NAME = "DepositWallet";
export const DEPOSIT_WALLET_DOMAIN_VERSION = "1";

export type RelayPayload = {
  address: Address;
  nonce: string;
};

export type NoncePayload = {
  nonce: string;
};

export type GiftWalletKind = "safe" | "proxy" | "deposit";
