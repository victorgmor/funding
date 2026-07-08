import WagmiScope from "@/components/app/WagmiScope";
import { FundOwnerControlsInner } from "@/components/funds/FundOwnerControls";
import { TradePanelInner } from "@/components/funds/TradePanel";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
};

export default function FundSidebar({ fund }: Props) {
  return (
    <WagmiScope>
      <FundOwnerControlsInner fund={fund} />
      <TradePanelInner fund={fund} />
    </WagmiScope>
  );
}
