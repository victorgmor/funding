import { useCallback, useEffect, useState, type ComponentType } from "react";

type ProvidersProps = {
  syncSession?: boolean;
  portalNavLogin?: boolean;
};

/**
 * Global wallet shell. Does not portal over the nav SSR placeholders —
 * those already show Loading (session) or Log in (anonymous) via CSS.
 * Privy loads when a session exists or the user clicks Log in.
 */
export default function AppProviders() {
  const [Providers, setProviders] = useState<ComponentType<ProvidersProps> | null>(
    null,
  );

  const mount = useCallback(() => {
    void import("./Providers").then((mod) => {
      setProviders(() => mod.default);
    });
  }, []);

  useEffect(() => {
    const hasSession =
      document.documentElement.dataset.walletSession === "1";

    if (hasSession) {
      mount();
      return;
    }

    const buttons = document.querySelectorAll<HTMLElement>(
      "[data-wallet-slot] [data-slot-when='anonymous']",
    );
    const onClick = () => mount();
    buttons.forEach((btn) => btn.addEventListener("click", onClick));
    return () => {
      buttons.forEach((btn) => btn.removeEventListener("click", onClick));
    };
  }, [mount]);

  if (!Providers) return null;
  return <Providers syncSession portalNavLogin />;
}
