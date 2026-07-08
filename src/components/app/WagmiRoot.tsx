import { useEffect } from "react";
import {
  disconnect,
  getAccount,
  reconnect,
  watchAccount,
} from "@wagmi/core";
import { wagmiConfig } from "@/lib/wagmi/config";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";
import { WAGMI_ACCOUNT_EVENT, writeWalletSession } from "@/lib/wagmi/wallet-session";

export default function WagmiRoot() {
  useEffect(() => {
    reconnect(wagmiConfig).catch(() => undefined);

    const sync = (account = getAccount(wagmiConfig)) => {
      writeWalletSession(account.isConnected ? account.address : undefined);
      window.dispatchEvent(
        new CustomEvent(WAGMI_ACCOUNT_EVENT, { detail: account }),
      );
    };

    sync();
    const unwatch = watchAccount(wagmiConfig, { onChange: sync });

    const onDisconnect = () => disconnect(wagmiConfig);
    window.addEventListener(WAGMI_DISCONNECT_EVENT, onDisconnect);

    return () => {
      unwatch();
      window.removeEventListener(WAGMI_DISCONNECT_EVENT, onDisconnect);
    };
  }, []);

  return null;
}
