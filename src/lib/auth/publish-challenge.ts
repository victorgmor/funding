import type { Hex } from "viem";
import {
  createBundleChallenge,
  verifyBundleSignature,
} from "@/lib/auth/bundle-auth";

export function createPublishChallenge(host: string, address: string) {
  return createBundleChallenge(host, address, "publish");
}

export async function verifyPublishSignature(input: {
  message: string;
  signature: Hex;
  managerAddress: string;
}) {
  return verifyBundleSignature({
    ...input,
    action: "publish",
  });
}
