import { UserPill } from "@privy-io/react-auth/ui";
import WalletAccountMenu from "@/components/app/WalletAccountMenu";

type Props = {
  address: `0x${string}`;
  label: string;
  onLogout: () => void;
};

export default function WalletMenuCompare({
  address,
  label,
  onLogout,
}: Props) {
  return (
    <div className="flex items-start gap-3">
      <WalletAccountMenu
        address={address}
        label={label}
        onLogout={onLogout}
      />
      <UserPill />
    </div>
  );
}
