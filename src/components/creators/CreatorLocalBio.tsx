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
    const refresh = () => {
      setBio(readLocalProfile(address)?.bio?.trim() ?? "");
    };
    refresh();
    window.addEventListener(LOCAL_PROFILE_UPDATED_EVENT, refresh);
    return () =>
      window.removeEventListener(LOCAL_PROFILE_UPDATED_EVENT, refresh);
  }, [address]);

  if (!bio) return null;

  return <p className="text-primary/70 mt-3 text-sm leading-relaxed">{bio}</p>;
}
