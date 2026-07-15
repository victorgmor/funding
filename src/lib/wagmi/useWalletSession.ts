import { useEffect, useState } from "react";
import { getAccount, watchAccount, type GetAccountReturnType } from "@wagmi/core";
import { wagmiConfig } from "@/lib/wagmi/config";
import {
  readWalletSession,
  WAGMI_ACCOUNT_EVENT,
} from "@/lib/wagmi/wallet-session";

export { WAGMI_ACCOUNT_EVENT } from "@/lib/wagmi/wallet-session";

export function useWalletSession() {
  const [sessionAddress, setSessionAddress] = useState(readWalletSession);
  const [account, setAccount] = useState<GetAccountReturnType>(() =>
    getAccount(wagmiConfig),
  );

  useEffect(() => {
    return watchAccount(wagmiConfig, { onChange: setAccount });
  }, []);

  useEffect(() => {
    const onAccount = (event: Event) => {
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
    return () => window.removeEventListener(WAGMI_ACCOUNT_EVENT, onAccount);
  }, []);

  const { address, isConnected, status } = account;
  const reconnecting =
    status === "connecting" || status === "reconnecting";
  const pending = Boolean(sessionAddress) && !isConnected;
  const restoring = pending || reconnecting;

  return {
    address: isConnected ? address : undefined,
    walletAddress: (isConnected ? address : sessionAddress) ?? undefined,
    displayAddress: (isConnected ? address : sessionAddress) ?? undefined,
    isConnected,
    status,
    restoring,
    pending,
  };
}
