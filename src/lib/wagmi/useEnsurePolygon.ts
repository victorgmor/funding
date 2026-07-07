import { useEffect } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";

export function useEnsurePolygon() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  const onPolygon = chainId === polygon.id;

  useEffect(() => {
    if (isConnected && !onPolygon) {
      switchChain({ chainId: polygon.id });
    }
  }, [isConnected, onPolygon, switchChain]);

  return { onPolygon, switching: isConnected && !onPolygon && isPending };
}
