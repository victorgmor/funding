import { useEffect, useState } from "react";
import {
  LOCAL_PROFILE_UPDATED_EVENT,
  readLocalProfile,
} from "@/lib/local-profile";

type Props = {
  address: string;
};

export default function CreatorLocalBio({ address }: Props) {
  const [bio, setBio] = useState("");

  useEffect(() => {
    const refreshLocal = () => {
      setBio(readLocalProfile(address)?.bio?.trim() ?? "");
    };
    refreshLocal();

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/managers/${encodeURIComponent(address)}`,
        );
        const data = (await res.json()) as { bio?: string };
        if (cancelled || !res.ok) return;
        const next =
          readLocalProfile(address)?.bio?.trim() || data.bio?.trim() || "";
        setBio(next);
      } catch {
        // keep local
      }
    })();

    window.addEventListener(LOCAL_PROFILE_UPDATED_EVENT, refreshLocal);
    return () => {
      cancelled = true;
      window.removeEventListener(LOCAL_PROFILE_UPDATED_EVENT, refreshLocal);
    };
  }, [address]);

  if (!bio) return null;

  return <p className="text-primary/70 mt-3 text-base leading-relaxed">{bio}</p>;
}
