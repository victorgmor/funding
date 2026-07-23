import { createConfig } from "@privy-io/wagmi";
import { polygon } from "viem/chains";
import { fallback, http } from "wagmi";

// Explicit RPCs — viem's default (polygon.drpc.org) blocks eth_call.
export const wagmiConfig = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: fallback([
      http("https://polygon-bor-rpc.publicnode.com"),
      http("https://polygon-rpc.com"),
      http("https://1rpc.io/matic"),
    ]),
  },
});
