import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  readWalletSession,
  WAGMI_ACCOUNT_EVENT,
} from "@/lib/wagmi/wallet-session";

export { WAGMI_ACCOUNT_EVENT } from "@/lib/wagmi/wallet-session";

export function useWalletSession() {
  const [sessionAddress, setSessionAddress] = useState(readWalletSession);
  const [hydrated, setHydrated] = useState(() => !readWalletSession());
  const { address, isConnected, status } = useAccount();

  useEffect(() => {
    const onAccount = (event: Event) => {
      setHydrated(true);
      const detail = (
        event as CustomEvent<{ address?: string; isConnected?: boolean }>
      ).detail;
      if (detail?.isConnected && detail.address) {
        setSessionAddress(detail.address.toLowerCase() as `0x${string}`);
      } else if (detail && !detail.isConnected) {
        setSessionAddress(null);
      }
    };

    window.addEventListener(WAGMI_ACCOUNT_EVENT, onAccount);
    const timeout = window.setTimeout(() => setHydrated(true), 2500);

    return () => {
      window.removeEventListener(WAGMI_ACCOUNT_EVENT, onAccount);
      window.clearTimeout(timeout);
    };
  }, []);

  const reconnecting =
    status === "connecting" || status === "reconnecting";
  const pending =
    Boolean(sessionAddress) && !isConnected && (!hydrated || reconnecting);
  const restoring = pending || reconnecting;

  return {
    address: isConnected ? address : undefined,
    displayAddress: (isConnected ? address : sessionAddress) ?? undefined,
    isConnected,
    status,
    restoring,
    pending,
  };
}
