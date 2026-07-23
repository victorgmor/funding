import LazyProviders from "@/components/app/LazyProviders";
import MandatePanel from "@/components/funds/MandatePanel";
import NewTradePanel from "@/components/funds/NewTradePanel";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
};

export default function FundSidebar({ fund }: Props) {
  return (
    <LazyProviders>
      <NewTradePanel fund={fund} />
      <MandatePanel fund={fund} />
    </LazyProviders>
  );
}
