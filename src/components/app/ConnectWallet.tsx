import { useEffect, useRef, useState } from "react";
import { connect, disconnect, getConnectors } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import CreatorAvatar from "@/components/creators/CreatorAvatar";
import SignOut from "@/components/fundations/icons/SignOut";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";
import { wagmiConfig } from "@/lib/wagmi/config";
import { creatorPath } from "@/lib/funds/creator";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  variant?: "nav" | "panel" | "create";
};

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className="text-primary/50"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function WalletNavMenu({
  address,
  label,
}: {
  address: `0x${string}`;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function disconnectWallet() {
    setOpen(false);
    disconnect(wagmiConfig);
    window.dispatchEvent(new Event(WAGMI_DISCONNECT_EVENT));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="hover:bg-primary/5 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors"
      >
        <CreatorAvatar address={address} name={label} size="xs" />
        <span className="text-primary max-w-32 truncate text-sm">{label}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="border-primary/10 bg-secondary absolute right-0 z-50 mt-2 min-w-40 rounded-lg border p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={disconnectWallet}
            className="text-primary hover:bg-primary/5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
          >
            <SignOut size="sm" aria-hidden />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConnectWallet({ variant = "panel" }: Props) {
  const { address, displayAddress, isConnected, restoring } = useWalletSession();
  const [connecting, setConnecting] = useState(false);
  const { switching } = useEnsurePolygon();
  const { name: displayName } = usePolymarketProfile(address ?? displayAddress);

  async function connectWallet() {
    const [connector] = getConnectors(wagmiConfig);
    if (!connector) return;
    setConnecting(true);
    try {
      await connect(wagmiConfig, { connector, chainId: polygon.id });
    } finally {
      setConnecting(false);
    }
  }

  function disconnectWallet() {
    disconnect(wagmiConfig);
    window.dispatchEvent(new Event(WAGMI_DISCONNECT_EVENT));
  }

  if (restoring) {
    if (variant === "panel" || variant === "create") {
      return <span className="text-primary/40 block min-h-9 text-sm" aria-hidden />;
    }

    if (displayAddress) {
      const label = displayName ?? addressDisplayFallback(displayAddress);
      return (
        <span className="text-primary/50 text-sm" aria-busy="true">
          {label}
        </span>
      );
    }

    return <span className="text-primary/40 text-sm" aria-busy="true">&nbsp;</span>;
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
      return <WalletNavMenu address={address} label={label} />;
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
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={connecting}
      onClick={() => void connectWallet()}
      className={
        variant === "nav"
          ? "text-primary hover:text-primary/80 text-sm disabled:opacity-50"
          : "bg-accent text-secondary hover:opacity-90 w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
      }
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
