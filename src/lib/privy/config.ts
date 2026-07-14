import {
  PUBLIC_PRIVY_APP_ID,
  PUBLIC_PRIVY_SIGNER_QUORUM_ID,
} from "astro:env/client";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { polygon } from "viem/chains";

export const privyAppId = PUBLIC_PRIVY_APP_ID?.trim() || "";

export const privySignerQuorumId = PUBLIC_PRIVY_SIGNER_QUORUM_ID?.trim() || "";

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    theme: "dark",
    accentColor: "#676FFF",
    showWalletLoginFirst: false,
    walletList: [],
    walletChainType: "ethereum-only",
  },
  defaultChain: polygon,
  supportedChains: [polygon],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
    showWalletUIs: true,
  },
  externalWallets: {
    disableAllExternalWallets: true,
  },
};
