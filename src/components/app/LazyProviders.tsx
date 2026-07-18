import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { WAGMI_ACCOUNT_EVENT } from "@/lib/wagmi/wallet-session";

type ProvidersProps = {
  children?: ReactNode;
  syncSession?: boolean;
  portalNavLogin?: boolean;
};

type Props = ProvidersProps & {
  fallback?: ReactNode;
  /** immediate: load on mount. session: wait for saved/connected wallet. */
  when?: "immediate" | "session";
};

/** Code-splits Privy/wagmi — island paints before the wallet bundle loads. */
export default function LazyProviders({
  children,
  fallback = null,
  when = "immediate",
  ...flags
}: Props) {
  const [Providers, setProviders] = useState<ComponentType<ProvidersProps> | null>(
    null,
  );
  const loading = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (cancelled || loading.current) return;
      loading.current = true;
      void import("./Providers").then((mod) => {
        if (!cancelled) setProviders(() => mod.default);
      });
    };

    if (when === "immediate") {
      load();
      return () => {
        cancelled = true;
      };
    }

    if (document.documentElement.dataset.walletSession === "1") {
      load();
    }

    const onAccount = () => load();
    window.addEventListener(WAGMI_ACCOUNT_EVENT, onAccount);
    return () => {
      cancelled = true;
      window.removeEventListener(WAGMI_ACCOUNT_EVENT, onAccount);
    };
  }, [when]);

  if (!Providers) return <>{fallback}</>;
  return <Providers {...flags}>{children}</Providers>;
}
