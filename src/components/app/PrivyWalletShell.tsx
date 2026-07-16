import { WalletsDialog } from "@privy-io/react-auth/ui";
import { polygon } from "wagmi/chains";
import { PUSD_ADDRESS } from "@/lib/polygon/usdc";

/** Privy wallet panel + pUSD send/receive UI. Pair with UserPill in the nav. */
export default function PrivyWalletShell() {
  return (
    <WalletsDialog
      networks={[{ id: polygon.id }]}
      assets={{
        ethereum: [
          {
            chain: polygon,
            address: PUSD_ADDRESS,
            ticker: "pUSD",
          },
        ],
      }}
    />
  );
}
