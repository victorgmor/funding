import { useEffect, useState } from "react";
import {
  getAccount,
  reconnect,
  watchAccount,
  type GetAccountReturnType,
} from "@wagmi/core";
import { wagmiConfig } from "@/lib/wagmi/config";

export function useSharedAccount() {
  const [account, setAccount] = useState<GetAccountReturnType>(() =>
    getAccount(wagmiConfig),
  );

  useEffect(() => {
    reconnect(wagmiConfig).catch(() => undefined);
    return watchAccount(wagmiConfig, {
      onChange: setAccount,
    });
  }, []);

  return {
    address: account.address,
    isConnected: account.isConnected,
    status: account.status,
    restoring:
      account.status === "connecting" || account.status === "reconnecting",
  };
}
