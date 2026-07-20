type Props = {
  label?: string;
  className?: string;
  /** "text" renders an inline loading label; "button" mirrors the nav wallet
   *  trigger so it doesn't flash as "Log in". */
  variant?: "text" | "button";
};

export default function WalletPanelPlaceholder({
  label = "Loading…",
  className = "",
  variant = "text",
}: Props) {
  if (variant === "button") {
    return (
      <span
        aria-busy="true"
        aria-live="polite"
        className={`bg-accent/40 text-secondary/60 inline-flex min-h-9 min-w-[5.5rem] animate-pulse items-center justify-center rounded-[var(--privy-border-radius-md,0.5rem)] px-2 py-2 text-sm font-medium ${className}`}
      >
        {label}
      </span>
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
