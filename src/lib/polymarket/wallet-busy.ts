export function isWalletBusyError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (/wallet busy/i.test(msg)) return true;

  try {
    const parsed = JSON.parse(msg) as { data?: { error?: string } };
    return /wallet busy/i.test(parsed.data?.error ?? "");
  } catch {
    return false;
  }
}

export const WALLET_BUSY_MESSAGE =
  "Deposit wallet is finishing another action — will retry automatically";
