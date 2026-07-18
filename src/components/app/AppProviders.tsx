import { useCallback, useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";

type ProvidersProps = {
  syncSession?: boolean;
  portalNavLogin?: boolean;
};

const navButtonClass =
  "bg-accent text-secondary hover:opacity-90 rounded-full px-4 py-1.5 text-sm font-medium transition-opacity";

/**
 * Global wallet shell. Privy/wagmi load only when:
 * - a saved session exists, or
 * - the user clicks Log in.
 */
export default function AppProviders() {
  const [Providers, setProviders] = useState<ComponentType<ProvidersProps> | null>(
    null,
  );
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  const [mobileSlot, setMobileSlot] = useState<HTMLElement | null>(null);

  const mount = useCallback(() => {
    if (Providers) return;
    void import("./Providers").then((mod) => {
      setProviders(() => mod.default);
    });
  }, [Providers]);

  useEffect(() => {
    setNavSlot(document.getElementById("nav-login-slot"));
    setMobileSlot(document.getElementById("mobile-login-slot"));
    if (document.documentElement.dataset.walletSession === "1") {
      mount();
    }
  }, [mount]);

  if (Providers) {
    return <Providers syncSession portalNavLogin />;
  }

  const placeholder = (
    <button type="button" onClick={mount} className={navButtonClass}>
      Log in
    </button>
  );

  return (
    <>
      {navSlot && createPortal(placeholder, navSlot)}
      {mobileSlot && createPortal(placeholder, mobileSlot)}
    </>
  );
}
