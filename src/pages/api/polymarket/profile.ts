import type { APIRoute } from "astro";
import {
  fetchPolymarketProfile,
  polymarketDisplayName,
  polymarketProfileImage,
} from "@/lib/polymarket/profile";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const address = url.searchParams.get("address")?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return new Response(JSON.stringify({ error: "Invalid address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await fetchPolymarketProfile(address);
  return new Response(
    JSON.stringify({
      address,
      name: polymarketDisplayName(profile, address),
      verified: Boolean(profile?.verifiedBadge),
      profileImage: polymarketProfileImage(profile),
      proxyWallet: profile?.proxyWallet ?? null,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
};
