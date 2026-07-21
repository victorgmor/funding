import { walletNavButtonClass } from "@/lib/walletNavChrome";

type Props = {
  label?: string;
  className?: string;
  /** "text" renders an inline loading label; "button" mirrors the nav wallet chip. */
  variant?: "text" | "button";
};

export default function WalletPanelPlaceholder({
  label = "Loading…",
  className = "",
  variant = "text",
}: Props) {
  if (variant === "button") {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        aria-live="polite"
        className={`${walletNavButtonClass} ${className}`}
      >
        <span className="animate-pulse">{label}</span>
      </button>
    );
  }

  return (
    <div
      className={`text-primary/50 min-h-9 text-sm ${className}`}
      aria-busy="true"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
