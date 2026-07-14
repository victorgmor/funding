import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CaretDown from "@/components/fundations/icons/CaretDown";
import SignOut from "@/components/fundations/icons/SignOut";
import { privyAppId } from "@/lib/privy/config";
import { WAGMI_DISCONNECT_EVENT } from "@/lib/wagmi/events";
import { creatorPath } from "@/lib/funds/creator";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  variant?: "nav" | "panel" | "create";
};

function WalletNavMenu({
  address,
  label,
  onLogout,
}: {
  address: `0x${string}`;
  label: string;
  onLogout: () => void;
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
        <CaretDown size="sm" className="text-primary/50" />
      </button>

      {open && (
        <div
          role="menu"
          className="border-primary/10 bg-secondary absolute right-0 z-50 mt-2 min-w-40 rounded-lg border p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="text-primary hover:bg-primary/5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
          >
            <SignOut size="sm" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectWalletInner({ variant = "panel" }: Props) {
  const { login, logout, ready } = usePrivy();
  const { address, displayAddress, isConnected, restoring } = useWalletSession();
  const { switching } = useEnsurePolygon();
  const { name: displayName } = usePolymarketProfile(address ?? displayAddress);

  function disconnectWallet() {
    void logout();
    window.dispatchEvent(new Event(WAGMI_DISCONNECT_EVENT));
  }

  if (!ready || restoring) {
    if (variant === "nav") {
      return (
        <button
          type="button"
          disabled
          className="text-primary/40 cursor-wait text-sm"
        >
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
        <WalletNavMenu
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
          ? "text-primary hover:text-primary/80 text-sm"
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
