import { usePrivy } from "@privy-io/react-auth";
import WalletMenuCompare from "@/components/app/WalletMenuCompare";
import { privyAppId } from "@/lib/privy/config";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";
import { creatorPath } from "@/lib/funds/creator";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";
import SignOut from "@/components/fundations/icons/SignOut";

type Props = {
  variant?: "nav" | "panel" | "create";
};

const navButtonClass =
  "bg-accent text-secondary hover:opacity-90 rounded-full px-4 py-1.5 text-sm font-medium transition-opacity disabled:cursor-wait disabled:opacity-60";

function ConnectWalletInner({ variant = "panel" }: Props) {
  const { login, logout } = usePrivy();
  const { address, displayAddress, isConnected, loading } = useWalletGate();
  const { switching } = useEnsurePolygon();
  const { name: displayName } = usePolymarketProfile(address ?? displayAddress);

  function disconnectWallet() {
    void logout();
    window.dispatchEvent(new Event(WAGMI_DISCONNECT_EVENT));
  }

  if (loading) {
    if (variant === "nav") {
      return (
        <button type="button" disabled className={navButtonClass}>
          Log in
        </button>
      );
    }

    if (variant === "panel" || variant === "create") {
      return <span className="text-primary/40 block min-h-9 text-sm" aria-hidden />;
    }

    return null;
  }

  if (isConnected && address) {
    if (variant === "create") {
      return null;
    }

    if (switching) {
      return (
        <span className="text-primary/60 text-sm">Switching to Polygon…</span>
      );
    }

    const label = displayName ?? addressDisplayFallback(address);

    if (variant === "nav") {
      return (
        <WalletMenuCompare
          address={address}
          label={label}
          onLogout={disconnectWallet}
        />
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={creatorPath(address)}
          className="text-primary/60 hover:text-primary text-sm transition-colors"
        >
          {label}
        </a>
        <button
          type="button"
          onClick={disconnectWallet}
          className="text-primary hover:text-primary/80 inline-flex items-center gap-2 text-sm"
        >
          <SignOut size="sm" aria-hidden />
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => login()}
      className={
        variant === "nav"
          ? navButtonClass
          : "bg-accent text-secondary hover:opacity-90 w-full rounded px-3 py-2 text-sm font-medium"
      }
    >
      Log in
    </button>
  );
}

export default function ConnectWallet(props: Props) {
  if (!privyAppId) {
    return (
      <span className="text-primary/50 text-sm">
        Set PUBLIC_PRIVY_APP_ID to enable login.
      </span>
    );
  }

  return <ConnectWalletInner {...props} />;
}
