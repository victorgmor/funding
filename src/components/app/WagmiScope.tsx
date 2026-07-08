import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useDisconnect, useReconnect, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi/config";

export const WAGMI_DISCONNECT_EVENT = "carriera:wagmi-disconnect";

function WagmiLifecycle() {
  const { reconnect } = useReconnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    reconnect();
  }, [reconnect]);

  useEffect(() => {
    const onDisconnect = () => disconnect();
    window.addEventListener(WAGMI_DISCONNECT_EVENT, onDisconnect);
    return () => window.removeEventListener(WAGMI_DISCONNECT_EVENT, onDisconnect);
  }, [disconnect]);

  return null;
}

export default function WagmiScope({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WagmiLifecycle />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
