import type { APIRoute } from "astro";
import {
  fetchPolymarketProfile,
  polymarketDisplayName,
  polymarketProfileImage,
} from "@/lib/polymarket/profile";
import { dbGetManager, managerDisplayName } from "@/lib/funds/managers-dynamodb";

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
    dbGetManager(id),
  ]);

  const polymarketName = polymarketDisplayName(profile, id);
  const polymarketImage = polymarketProfileImage(profile);

  return new Response(
    JSON.stringify({
      address: id,
      name: manager ? managerDisplayName(manager) : polymarketName,
      username: manager?.username ?? "",
      bio: manager?.bio ?? "",
      verified: manager?.verified ?? Boolean(profile?.verifiedBadge),
      profileImage: manager?.avatarUrl ?? polymarketImage,
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
