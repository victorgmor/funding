export type LocalProfile = {
  username: string;
  bio: string;
  avatarDataUrl: string | null;
};

const KEY = (address: string) =>
  `polyfund:profile:${address.toLowerCase()}`;

export const LOCAL_PROFILE_UPDATED_EVENT = "polyfund:profile-updated";

export function readLocalProfile(address: string): LocalProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      bio: typeof parsed.bio === "string" ? parsed.bio : "",
      avatarDataUrl:
        typeof parsed.avatarDataUrl === "string" ? parsed.avatarDataUrl : null,
    };
  } catch {
    return null;
  }
}

/** Local username when set; otherwise null. */
export function localDisplayName(address: string): string | null {
  return readLocalProfile(address)?.username?.trim() || null;
}

export function writeLocalProfile(address: string, profile: LocalProfile) {
  localStorage.setItem(KEY(address), JSON.stringify(profile));
  window.dispatchEvent(
    new CustomEvent(LOCAL_PROFILE_UPDATED_EVENT, {
      detail: { address: address.toLowerCase() },
    }),
  );
}
