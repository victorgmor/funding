type Props = {
  label?: string;
  className?: string;
  /** "text" renders an inline loading label; "button" renders a muted pill
   *  shaped like the nav connect button so it doesn't flash as "Log in". */
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
        className={`bg-accent/40 text-secondary/60 inline-flex min-h-9 min-w-[5.5rem] animate-pulse items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium ${className}`}
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
