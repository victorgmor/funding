import { useCallback, useEffect, useState, type ComponentType } from "react";

type ProvidersProps = {
  syncSession?: boolean;
  portalNavLogin?: boolean;
};

/**
 * Global wallet shell. SSR shows one chip (Log in / Loading… label).
 * Privy loads when a session exists or the user clicks that chip.
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
      "[data-wallet-login]",
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
