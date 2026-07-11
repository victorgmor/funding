import { iconSizes, type IconSize } from "@/components/fundations/icons/sizes";

type Props = {
  size?: IconSize;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
};

export default function SignOut({
  size = "sm",
  className,
  "aria-label": ariaLabel = "Sign out",
  "aria-hidden": ariaHidden,
}: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      fill="currentColor"
      className={`inline-block shrink-0 ${iconSizes[size]} ${className ?? ""}`}
      aria-label={ariaHidden ? undefined : ariaLabel}
      aria-hidden={ariaHidden}
    >
      <path
        d="M224,56V200a16,16,0,0,1-16,16H48V40H208A16,16,0,0,1,224,56Z"
        opacity="0.2"
      />
      <path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z" />
    </svg>
  );
}
