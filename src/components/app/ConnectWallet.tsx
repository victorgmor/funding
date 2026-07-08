import {
  useAccount,
  useConnect,
  useDisconnect,
} from "wagmi";
import { polygon } from "wagmi/chains";
import { WAGMI_DISCONNECT_EVENT } from "@/components/app/WagmiScope";
import { creatorPath } from "@/lib/funds/creator";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";

type Props = {
  variant?: "nav" | "panel" | "create";
};

export default function ConnectWallet({ variant = "panel" }: Props) {
  const { address, isConnected, status } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switching } = useEnsurePolygon();
  const { name: displayName } = usePolymarketProfile(address);

  const restoring = status === "connecting" || status === "reconnecting";

  if (restoring) {
    return (
      <span
        className={
          variant === "create"
            ? "text-primary/60 text-sm"
            : "text-primary/60 text-sm"
        }
      >
        Restoring wallet…
      </span>
    );
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
    return (
      <div
        className={
          variant === "nav"
            ? "flex items-center gap-2"
            : "flex flex-wrap items-center gap-2"
        }
      >
        <a
          href={creatorPath(address)}
          className="text-primary/60 hover:text-primary text-sm transition-colors"
        >
          {label}
        </a>
        <button
          type="button"
          onClick={() => {
            disconnect();
            window.dispatchEvent(new Event(WAGMI_DISCONNECT_EVENT));
          }}
          className="text-primary hover:text-primary/80 text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => connect({ connector: connectors[0], chainId: polygon.id })}
      className={
        variant === "nav"
          ? "text-primary hover:text-primary/80 text-sm disabled:opacity-50"
          : "bg-accent text-secondary hover:opacity-90 w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
      }
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
