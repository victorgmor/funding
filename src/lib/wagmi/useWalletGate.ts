import { usePrivy } from "@privy-io/react-auth";
import { privyAppId } from "@/lib/privy/config";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

/** Wallet + Privy readiness — use in panels before showing connect UI. */
export function useWalletGate() {
  const session = useWalletSession();
  const { ready: privyReady } = usePrivy();
  const loading =
    (!!privyAppId && !privyReady) || session.restoring || session.pending;

  return {
    ...session,
    loading,
    privyReady: privyAppId ? privyReady : true,
  };
}
