import Skeleton from "@/components/app/Skeleton";
import { walletNavButtonClass } from "@/lib/walletNavChrome";

type Props = {
  label?: string;
  className?: string;
  /** "text" renders skeleton lines; "button" mirrors the nav wallet chip. */
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
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className="animate-pulse h-5 w-16 rounded bg-white/20"
        />
      </button>
    );
  }

  return (
    <div
      className={`min-h-9 space-y-2 ${className}`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-2/3 rounded" />
      <Skeleton className="h-4 w-2/5 rounded" />
    </div>
  );
}
