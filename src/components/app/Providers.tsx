import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAccount, watchAccount } from "@wagmi/core";
import ConnectWallet from "@/components/app/ConnectWallet";
import { privyAppId, privyConfig } from "@/lib/privy/config";
import { embeddedWalletForWagmi } from "@/lib/privy/wallet";
import { wagmiConfig } from "@/lib/wagmi/config";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";
import {
  WAGMI_ACCOUNT_EVENT,
  writeWalletSession,
} from "@/lib/wagmi/wallet-session";

const PolymarketDepositSetup = lazy(
  () => import("@/components/app/PolymarketDepositSetup"),
);
const InvestorTradeAutopilot = lazy(
  () => import("@/components/app/InvestorTradeAutopilot"),
);

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

function NavLoginPortals() {
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // createPortal appends into the slot without clearing SSR children.
    // Wipe the pre-hydration placeholders so they don't linger as ghosts.
    const nav = document.getElementById("nav-login-slot");
    const mobile = document.getElementById("mobile-login-slot");
    if (nav) nav.innerHTML = "";
    if (mobile) mobile.innerHTML = "";
    setNavSlot(nav);
    setMobileSlot(mobile);
  }, []);

  return (
    <>
      {navSlot && createPortal(<ConnectWallet variant="nav" />, navSlot)}
      {mobileSlot && createPortal(<ConnectWallet variant="nav" />, mobileSlot)}
    </>
  );
}

type Props = {
  children?: ReactNode;
  /** Global-only extras (deposit setup, cross-fund autopilot). */
  syncSession?: boolean;
  /** Portal nav login buttons from the global AppProviders island. */
  portalNavLogin?: boolean;
};

/** Privy + wagmi context for Astro client islands (each island needs its own wrapper). */
export default function Providers({
  children,
  syncSession = false,
  portalNavLogin = false,
}: Props) {
  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider
          config={wagmiConfig}
          setActiveWalletForWagmi={embeddedWalletForWagmi}
        >
          <WalletSessionSync />
          {syncSession && (
            <Suspense fallback={null}>
              <PolymarketDepositSetup />
              <InvestorTradeAutopilot />
            </Suspense>
          )}
          {portalNavLogin && <NavLoginPortals />}
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
