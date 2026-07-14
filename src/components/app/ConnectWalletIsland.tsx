import ConnectWallet from "@/components/app/ConnectWallet";
import Providers from "@/components/app/Providers";

export default function ConnectWalletIsland() {
  return (
    <Providers>
      <ConnectWallet variant="nav" />
    </Providers>
  );
}
