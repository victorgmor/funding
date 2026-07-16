import { useEffect, useState } from "react";
import { UserPill } from "@privy-io/react-auth/ui";
import WalletAccountMenu from "@/components/app/WalletAccountMenu";

type Props = {
  address: `0x${string}`;
  label: string;
  onLogout: () => void;
};

const compareKey = "wallet-menu-compare";

export function walletMenuCompareEnabled() {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("walletCompare")) {
    sessionStorage.setItem(compareKey, "1");
    return true;
  }
  return sessionStorage.getItem(compareKey) === "1";
}

export default function WalletMenuCompare({
  address,
  label,
  onLogout,
}: Props) {
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    setCompare(walletMenuCompareEnabled());
  }, []);

  if (!compare) {
    return (
      <WalletAccountMenu
        address={address}
        label={label}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="flex items-start gap-6">
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-primary/45">
          Custom
        </span>
        <WalletAccountMenu
          address={address}
          label={label}
          onLogout={onLogout}
        />
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-primary/45">
          Privy OEM
        </span>
        <UserPill />
      </div>
    </div>
  );
}
