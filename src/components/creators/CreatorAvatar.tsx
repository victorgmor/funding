import { useEffect, useState } from "react";
import {
  LOCAL_PROFILE_UPDATED_EVENT,
  readLocalProfile,
} from "@/lib/local-profile";
import { useLocalDisplayName } from "@/lib/useLocalDisplayName";
import { fetchClientPolymarketProfile } from "@/lib/polymarket/profile-client";

type Props = {
  address: string;
  name: string;
  initialImage?: string | null;
  size?: "2xs" | "xs" | "sm" | "md";
  className?: string;
};

const sizes = {
  "2xs": "size-5 text-[10px]",
  xs: "size-8 text-sm",
  sm: "size-10 text-base",
  md: "size-16 text-xl",
} as const;

export default function CreatorAvatar({
  address,
  name,
  initialImage = null,
  size = "md",
  className = "",
}: Props) {
  const [image, setImage] = useState(initialImage);
  const displayName = useLocalDisplayName(address, name);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const sizeClass = sizes[size];

  useEffect(() => {
    if (initialImage) {
      setImage(initialImage);
      return;
    }

    const local = readLocalProfile(address)?.avatarDataUrl;
    if (local) {
      setImage(local);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchClientPolymarketProfile(address);
        if (!cancelled && data?.profileImage) setImage(data.profileImage);
      } catch {
        // keep fallback initial
      }
    }

    void load();

    const onProfile = () => {
      const next = readLocalProfile(address)?.avatarDataUrl;
      if (next) setImage(next);
    };
    window.addEventListener(LOCAL_PROFILE_UPDATED_EVENT, onProfile);

    return () => {
      cancelled = true;
      window.removeEventListener(LOCAL_PROFILE_UPDATED_EVENT, onProfile);
    };
  }, [address, initialImage]);

  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={
          size === "2xs" ? 20 : size === "xs" ? 32 : size === "sm" ? 40 : 64
        }
        height={
          size === "2xs" ? 20 : size === "xs" ? 32 : size === "sm" ? 40 : 64
        }
        className={`bg-secondary shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <div
      className={`bg-secondary text-primary flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
