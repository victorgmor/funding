import { useEffect, useState } from "react";
import { getAccount, switchChain, watchAccount } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import { wagmiConfig } from "@/lib/wagmi/config";

export function useEnsurePolygon() {
  const [switching, setSwitching] = useState(false);
  const [account, setAccount] = useState(() => getAccount(wagmiConfig));

  useEffect(() => watchAccount(wagmiConfig, { onChange: setAccount }), []);

  const onPolygon = account.chainId === polygon.id;

  useEffect(() => {
    if (!account.isConnected || onPolygon) return;

    setSwitching(true);
    switchChain(wagmiConfig, { chainId: polygon.id })
      .catch(() => undefined)
      .finally(() => setSwitching(false));
  }, [account.isConnected, onPolygon]);

  return {
    onPolygon,
    switching: account.isConnected && !onPolygon && switching,
  };
}
