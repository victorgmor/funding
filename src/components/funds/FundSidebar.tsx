import { FundOwnerControlsInner } from "@/components/funds/FundOwnerControls";
import ManagerPoolPanel from "@/components/funds/ManagerPoolPanel";
import MandatePanel from "@/components/funds/MandatePanel";
import Providers from "@/components/app/Providers";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
};

export default function FundSidebar({ fund }: Props) {
  return (
    <Providers>
      <FundOwnerControlsInner fund={fund} />
      <ManagerPoolPanel fund={fund} />
      <MandatePanel fund={fund} />
    </Providers>
  );
}
