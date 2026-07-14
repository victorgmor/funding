import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import { ensureDepositWallet } from "@/lib/polymarket/depositWallet";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";
import { DEPOSIT_WALLET_UPDATED_EVENT } from "@/lib/wagmi/events";
import { wagmiConfig } from "@/lib/wagmi/config";

/** Create the user's Polymarket deposit wallet after Privy login (idempotent). */
export default function PolymarketDepositSetup() {
  const { ready, authenticated } = usePrivy();
  const { address, isConnected, restoring } = useWalletSession();
  const { onPolygon, switching } = useEnsurePolygon();
  const running = useRef(false);
  const readyFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected) readyFor.current = null;
  }, [isConnected]);

  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !isConnected ||
      !address ||
      restoring ||
      switching ||
      !onPolygon
    ) {
      return;
    }

    const key = address.toLowerCase();
    if (readyFor.current === key || running.current) return;

    running.current = true;
    void (async () => {
      try {
        const walletClient = await getWalletClient(wagmiConfig, {
          chainId: polygon.id,
          account: address,
        });
        if (!walletClient) return;

        await ensureDepositWallet(walletClient);
        readyFor.current = key;
        window.dispatchEvent(new Event(DEPOSIT_WALLET_UPDATED_EVENT));
      } catch {
        /* user may dismiss relayer approval — retry next connect */
      } finally {
        running.current = false;
      }
    })();
  }, [
    ready,
    authenticated,
    isConnected,
    address,
    restoring,
    switching,
    onPolygon,
  ]);

  return null;
}
