import { useEffect, useState } from "react";

type Props = {
  address: string;
  name: string;
  initialImage?: string | null;
  size?: "xs" | "sm" | "md";
};

const sizes = {
  xs: "size-8 text-sm",
  sm: "size-10 text-base",
  md: "size-16 text-xl",
} as const;

export default function CreatorAvatar({
  address,
  name,
  initialImage = null,
  size = "md",
}: Props) {
  const [image, setImage] = useState(initialImage);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeClass = sizes[size];

  useEffect(() => {
    if (initialImage) {
      setImage(initialImage);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/polymarket/profile?address=${encodeURIComponent(address)}`,
        );
        const data = (await res.json()) as { profileImage?: string | null };
        if (!cancelled && data.profileImage) setImage(data.profileImage);
      } catch {
        // keep fallback initial
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, initialImage]);

  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size === "xs" ? 32 : size === "sm" ? 40 : 64}
        height={size === "xs" ? 32 : size === "sm" ? 40 : 64}
        className={`border-primary/10 shrink-0 rounded-full border object-cover ${sizeClass}`}
      />
    );
  }

  return (
    <div
      className={`bg-primary/10 text-primary border-primary/10 flex shrink-0 items-center justify-center rounded-full border font-semibold ${sizeClass}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
