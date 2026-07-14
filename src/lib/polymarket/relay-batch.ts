import type { RelayClient, DepositWalletCall } from "@polymarket/builder-relayer-client";
import type { Address } from "viem";
import { isWalletBusyError } from "@/lib/polymarket/wallet-busy";

const relayChains = new Map<string, Promise<unknown>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialize relay batches per deposit wallet within this process. */
function enqueueDepositWalletRelay<T>(
  depositAddress: Address,
  fn: () => Promise<T>,
): Promise<T> {
  const key = depositAddress.toLowerCase();
  const prev = relayChains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  relayChains.set(key, next);
  return next.finally(() => {
    if (relayChains.get(key) === next) relayChains.delete(key);
  });
}

export async function executeDepositWalletBatch(
  relayer: RelayClient,
  calls: DepositWalletCall[],
  depositAddress: Address,
  deadline: string,
): Promise<void> {
  return enqueueDepositWalletRelay(depositAddress, async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await relayer.executeDepositWalletBatch(
          calls,
          depositAddress,
          deadline,
        );
        const confirmed = await response.wait();
        if (!confirmed) {
          throw new Error("Deposit wallet relay batch failed — try again shortly");
        }
        return;
      } catch (error) {
        if (attempt < 4 && isWalletBusyError(error)) {
          await sleep(1500 * attempt);
          continue;
        }
        throw error;
      }
    }
  });
}
