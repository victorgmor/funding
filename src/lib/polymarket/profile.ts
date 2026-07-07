export type PolymarketProfile = {
  name?: string;
  pseudonym?: string;
  displayUsernamePublic?: boolean;
  verifiedBadge?: boolean;
  proxyWallet?: string;
  profileImage?: string;
};

async function fetchProfileByAddress(
  address: string,
): Promise<PolymarketProfile | null> {
  const res = await fetch(
    `https://gamma-api.polymarket.com/public-profile?address=${address}`,
  );
  if (!res.ok) return null;
  return res.json();
}

export async function fetchPolymarketProfile(
  address: string,
): Promise<PolymarketProfile | null> {
  try {
    const profile = await fetchProfileByAddress(address);
    if (!profile) return null;

    if (polymarketProfileImage(profile)) return profile;

    const proxy = profile.proxyWallet?.trim();
    if (!proxy || proxy.toLowerCase() === address.toLowerCase()) return profile;

    const viaProxy = await fetchProfileByAddress(proxy);
    if (!viaProxy?.profileImage) return profile;

    return { ...profile, profileImage: viaProxy.profileImage };
  } catch {
    return null;
  }
}

export function polymarketProfileImage(
  profile: PolymarketProfile | null,
): string | null {
  const url =
    profile?.profileImage?.trim() ??
    (profile as { imageURI?: string } | null)?.imageURI?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return url;
    }
  } catch {
    return null;
  }

  return null;
}

export function polymarketDisplayName(
  profile: PolymarketProfile | null,
  address: string,
): string {
  if (profile?.displayUsernamePublic !== false && profile?.name?.trim()) {
    return profile.name.trim();
  }
  if (profile?.pseudonym?.trim()) return profile.pseudonym.trim();
  return addressDisplayFallback(address);
}

export function addressDisplayFallback(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isAddressDisplayFallback(
  name: string,
  address: string,
): boolean {
  return name.toLowerCase() === addressDisplayFallback(address).toLowerCase();
}
