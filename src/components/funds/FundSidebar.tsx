import LazyProviders from "@/components/app/LazyProviders";
import { FundOwnerControlsInner } from "@/components/funds/FundOwnerControls";
import ManagerPoolPanel from "@/components/funds/ManagerPoolPanel";
import MandatePanel from "@/components/funds/MandatePanel";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
};

export default function FundSidebar({ fund }: Props) {
  return (
    <LazyProviders>
      <FundOwnerControlsInner fund={fund} />
      <ManagerPoolPanel fund={fund} />
      <MandatePanel fund={fund} />
    </LazyProviders>
  );
}
