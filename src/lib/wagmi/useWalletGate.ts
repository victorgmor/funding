import { usePrivy } from "@privy-io/react-auth";
import { privyAppId } from "@/lib/privy/config";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

/** Wallet + Privy readiness — use in panels before showing connect UI. */
export function useWalletGate() {
  const session = useWalletSession();
  const { ready: privyReady } = usePrivy();

  // True when localStorage shows a saved session but wagmi hasn't hydrated it
  // yet. We KNOW the user is connected; callers should render a placeholder,
  // not the connect button.
  const hasSession = Boolean(session.walletAddress);

  // Only genuinely "loading" when we don't have a session and wagmi isn't ready.
  // With a session we treat the pre-hydration window as restoring, not loading.
  const privyLoading = !!privyAppId && !privyReady;
  const loading = privyLoading && !hasSession;

  return {
    ...session,
    hasSession,
    loading,
    privyReady: privyAppId ? privyReady : true,
  };
}
