import { useLocalDisplayName } from "@/lib/useLocalDisplayName";

type Props = {
  address: string;
  fallback: string;
  className?: string;
};

/** Renders local username when set for this wallet, else fallback. */
export default function CreatorName({ address, fallback, className }: Props) {
  const name = useLocalDisplayName(address, fallback);
  return <span className={className}>{name}</span>;
}
