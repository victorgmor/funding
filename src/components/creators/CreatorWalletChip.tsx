import { useEffect, useState, type MouseEvent } from "react";
import { addressDisplayFallback } from "@/lib/polymarket/profile";

type Props = {
  address: string;
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function CreatorWalletChip({ address }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function onCopy(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    await copyText(address);
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={(event) => void onCopy(event)}
      className="text-primary/60 hover:text-primary inline-flex items-center gap-1.5 font-mono text-sm transition-colors"
      title={address}
    >
      {addressDisplayFallback(address)}
      <span aria-hidden className="text-xs">
        {copied ? "✓" : "⧉"}
      </span>
    </button>
  );
}
