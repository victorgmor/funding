import { verifyMessage, type Hex } from "viem";
import { polygon } from "wagmi/chains";
import {
  consumeChallenge,
  saveChallenge,
  type StoredChallenge,
} from "@/lib/auth/challenge-store";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const NONCE_BYTES = 16;

export type BundleAuthAction =
  | "publish"
  | "manage"
  | "close"
  | "commit"
  | "withdraw"
  | "instruct"
  | "authorize"
  | "unarchive";

const ACTION_TEXT: Record<BundleAuthAction, string> = {
  publish: "publish a fund",
  manage: "update a fund",
  close: "close a fund",
  commit: "commit capital to a fund",
  withdraw: "withdraw capital from a fund",
  instruct: "publish a fund trade instruction",
  authorize: "authorize automated fund trading",
  unarchive: "restore an archived fund",
};

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeSlug(slug?: string) {
  return slug?.trim() ?? "";
}

export async function createBundleChallenge(
  host: string,
  address: string,
  action: BundleAuthAction,
  slug?: string,
) {
  const normalized = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Invalid wallet address");
  }

  const fundSlug = normalizeSlug(slug);
  if (
    (action === "manage" ||
      action === "close" ||
      action === "commit" ||
      action === "withdraw" ||
      action === "instruct" ||
      action === "authorize") &&
    !fundSlug
  ) {
    throw new Error("Fund slug required");
  }

  const nonce = randomNonce();
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  const stored: StoredChallenge = {
    address: normalized,
    action,
    slug: fundSlug,
    expiresAt,
  };

  await saveChallenge(nonce, stored);

  const lines = [
    `${host} wants you to ${ACTION_TEXT[action]} on Polygon:`,
    "",
    `Address: ${normalized}`,
    `Action: ${action}`,
  ];

  if (fundSlug) lines.push(`Fund: ${fundSlug}`);
  lines.push(
    `Chain ID: ${polygon.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  );

  return { message: lines.join("\n"), nonce, expiresAt };
}

function parseField(message: string, key: string): string | null {
  const prefix = `${key}: `;
  for (const line of message.split("\n")) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return null;
}

export async function verifyBundleSignature(input: {
  message: string;
  signature: Hex;
  managerAddress: string;
  action: BundleAuthAction;
  slug?: string;
}): Promise<string | null> {
  const address = parseField(input.message, "Address");
  const action = parseField(input.message, "Action") as BundleAuthAction | null;
  const fundSlug =
    parseField(input.message, "Fund") ?? parseField(input.message, "Bundle");
  const chainId = parseField(input.message, "Chain ID");
  const nonce = parseField(input.message, "Nonce");
  const issuedAt = parseField(input.message, "Issued At");

  if (!address || !action || !chainId || !nonce || !issuedAt) {
    return "Invalid signature message";
  }

  if (action !== input.action) {
    return "Signature action does not match request";
  }

  const requestSlug = normalizeSlug(input.slug);
  const messageSlug = normalizeSlug(fundSlug ?? undefined);

  if (
    input.action === "manage" ||
    input.action === "close" ||
    input.action === "commit" ||
    input.action === "withdraw" ||
    input.action === "instruct" ||
    input.action === "authorize"
  ) {
    if (!messageSlug || !requestSlug || messageSlug !== requestSlug) {
      return "Signature fund does not match request";
    }
  }

  if (address.toLowerCase() !== input.managerAddress.toLowerCase()) {
    return "Signature address does not match wallet";
  }

  if (Number(chainId) !== polygon.id) {
    return "Signature must be on Polygon";
  }

  const issuedMs = Date.parse(issuedAt);
  if (!Number.isFinite(issuedMs) || Date.now() - issuedMs > CHALLENGE_TTL_MS) {
    return "Challenge expired — try again";
  }

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: input.message,
    signature: input.signature,
  });

  if (!valid) return "Invalid signature";

  const consumed = await consumeChallenge(nonce, {
    address: address.toLowerCase(),
    action: input.action,
    slug: requestSlug,
    expiresAt: 0,
  });

  if (!consumed) {
    return "Challenge expired or already used — try again";
  }

  return null;
}
