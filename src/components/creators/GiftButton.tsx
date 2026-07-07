import { useEffect, useState, type ComponentType } from "react";
import type { Address } from "viem";

export type GiftFormProps = {
  recipient: Address;
  creatorName: string;
};

function GiftShell() {
  return (
    <div className="border-primary/10 flex shrink-0 items-center gap-2 rounded-full border py-1 pl-3 pr-1 opacity-50">
      <span className="text-primary/40 text-sm">$</span>
      <input
        type="number"
        disabled
        defaultValue={5}
        aria-label="Gift amount in USDC"
        className="text-primary w-12 border-0 bg-transparent px-0 py-0 text-sm text-right font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled
        className="bg-accent text-white rounded-full px-4 py-1.5 text-sm font-medium"
      >
        Gift
      </button>
    </div>
  );
}

export default function GiftButton(props: GiftFormProps) {
  const [GiftForm, setGiftForm] = useState<ComponentType<GiftFormProps> | null>(
    null,
  );

  useEffect(() => {
    void import("./GiftForm").then((mod) => setGiftForm(() => mod.default));
  }, []);

  if (!GiftForm) return <GiftShell />;

  return <GiftForm {...props} />;
}
