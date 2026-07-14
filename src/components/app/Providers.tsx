import { useEffect, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAccount, watchAccount } from "@wagmi/core";
import { privyAppId, privyConfig } from "@/lib/privy/config";
import { wagmiConfig } from "@/lib/wagmi/config";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";
import {
  WAGMI_ACCOUNT_EVENT,
  writeWalletSession,
} from "@/lib/wagmi/wallet-session";

const queryClient = new QueryClient();

function WalletSessionSync() {
  const { logout } = usePrivy();

  useEffect(() => {
    const sync = (account = getAccount(wagmiConfig)) => {
      writeWalletSession(account.isConnected ? account.address : undefined);
      window.dispatchEvent(
        new CustomEvent(WAGMI_ACCOUNT_EVENT, { detail: account }),
      );
    };

    sync();
    const unwatch = watchAccount(wagmiConfig, { onChange: sync });

    const onDisconnect = () => {
      void logout();
    };
    window.addEventListener(WAGMI_DISCONNECT_EVENT, onDisconnect);

    return () => {
      unwatch();
      window.removeEventListener(WAGMI_DISCONNECT_EVENT, onDisconnect);
    };
  }, [logout]);

  return null;
}

type Props = {
  children?: ReactNode;
  /** Only the global AppProviders island should sync wallet session. */
  syncSession?: boolean;
};

/** Privy + wagmi context for Astro client islands (each island needs its own wrapper). */
export default function Providers({ children, syncSession = false }: Props) {
  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {syncSession && <WalletSessionSync />}
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
