import { createConfig } from "@privy-io/wagmi";
import { polygon } from "viem/chains";
import { http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(),
  },
});
