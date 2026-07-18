import { privyAppId } from "@/lib/privy/config";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";
import { usePrivy } from "@privy-io/react-auth";

/** Wallet + Privy readiness — use in panels before showing connect UI. */
export function useWalletGate() {
  const session = useWalletSession();
  const { ready: privyReady } = usePrivy();

  const hasSession = Boolean(session.walletAddress);
  const privyLoading = Boolean(privyAppId) && !privyReady;
  // Saved session or wagmi reconnect ⇒ still loading. Never flash Connect.
  const loading = privyLoading || session.restoring;

  return {
    ...session,
    hasSession,
    loading,
    privyReady: privyAppId ? privyReady : true,
  };
}
