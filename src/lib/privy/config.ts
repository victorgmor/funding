import type { PrivyClientConfig } from "@privy-io/react-auth";
import { polygon } from "viem/chains";

export const privyAppId =
  import.meta.env.PUBLIC_PRIVY_APP_ID?.trim() || "";

export const privySignerQuorumId =
  import.meta.env.PUBLIC_PRIVY_SIGNER_QUORUM_ID?.trim() || "";

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "dark",
    accentColor: "#676FFF",
    showWalletLoginFirst: false,
  },
  defaultChain: polygon,
  supportedChains: [polygon],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
    showWalletUIs: true,
  },
};
