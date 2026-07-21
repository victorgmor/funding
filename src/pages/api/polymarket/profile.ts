import type { APIRoute } from "astro";
import {
  fetchPolymarketProfile,
} from "@/lib/polymarket/profile";
import { getManagerProfile } from "@/lib/funds/store";
import { managerDisplayName } from "@/lib/funds/managers-dynamodb";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const address = url.searchParams.get("address")?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return new Response(JSON.stringify({ error: "Invalid address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = address.toLowerCase();
  const [profile, manager] = await Promise.all([
    fetchPolymarketProfile(id),
    getManagerProfile(id),
  ]);

  return new Response(
    JSON.stringify({
      address: id,
      name: managerDisplayName(manager),
      username: manager.username,
      bio: manager.bio,
      verified: manager.verified,
      profileImage: manager.avatarUrl,
      proxyWallet: profile?.proxyWallet ?? null,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
};
