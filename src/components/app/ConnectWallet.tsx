import { usePrivy } from "@privy-io/react-auth";
import WalletAccountMenu from "@/components/app/WalletAccountMenu";
import WalletPanelPlaceholder from "@/components/app/WalletPanelPlaceholder";
import { privyAppId } from "@/lib/privy/config";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import { walletNavButtonClass } from "@/lib/walletNavChrome";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";

type Props = {
  variant?: "nav" | "panel" | "create";
};

function ConnectWalletInner({ variant = "panel" }: Props) {
  const { login, logout } = usePrivy();
  const { address, displayAddress, isConnected, hasSession } = useWalletGate();
  const { switching } = useEnsurePolygon();
  const { name: displayName, verified } = usePolymarketProfile(
    address ?? displayAddress,
  );

  const sessionHint =
    hasSession ||
    (typeof document !== "undefined" &&
      document.documentElement.dataset.walletSession === "1");

  function disconnectWallet() {
    void logout();
    window.dispatchEvent(new Event(WAGMI_DISCONNECT_EVENT));
  }

  // Saved session still reconnecting — never flash Log in.
  if (sessionHint && !isConnected) {
    return <WalletPanelPlaceholder label="Loading wallet…" variant="button" />;
  }

  if (isConnected && address) {
    if (switching) {
      return (
        <span className="text-primary/60 text-sm">Switching to Polygon…</span>
      );
    }

    const raw = displayName || addressDisplayFallback(address);
    const label = /^0x[a-fA-F0-9]{40}$/i.test(raw)
      ? addressDisplayFallback(raw)
      : raw;

    return (
      <WalletAccountMenu
        address={address}
        label={label}
        verified={verified}
        onLogout={disconnectWallet}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => login()}
      className={
        variant === "panel"
          ? `${walletNavButtonClass} w-full`
          : walletNavButtonClass
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
