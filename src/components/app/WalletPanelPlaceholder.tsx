type Props = {
  label?: string;
  className?: string;
};

export default function WalletPanelPlaceholder({
  label = "Loading…",
  className = "",
}: Props) {
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
