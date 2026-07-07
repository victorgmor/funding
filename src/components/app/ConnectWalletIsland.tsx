import WagmiScope from "./WagmiScope";
import ConnectWallet from "./ConnectWallet";

export default function ConnectWalletIsland() {
  return (
    <WagmiScope>
      <ConnectWallet variant="nav" />
    </WagmiScope>
  );
}
