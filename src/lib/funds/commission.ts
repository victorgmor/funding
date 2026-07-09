import { formatUnits, parseUnits } from "viem";

export const PLATFORM_COMMISSION_BPS = 1000; // 10%

export type UnlockPaymentSplit = {
  creatorUsdc: number;
  commissionUsdc: number;
};

export function splitUnlockPayment(totalUsdc: number): UnlockPaymentSplit {
  const total = parseUnits(totalUsdc.toFixed(6), 6);
  const commission = (total * BigInt(PLATFORM_COMMISSION_BPS)) / 10000n;
  const creator = total - commission;

  return {
    creatorUsdc: Number(formatUnits(creator, 6)),
    commissionUsdc: Number(formatUnits(commission, 6)),
  };
}

export function isValidFeeWallet(address: string | null | undefined): address is `0x${string}` {
  return Boolean(address && /^0x[a-fA-F0-9]{40}$/i.test(address));
}
