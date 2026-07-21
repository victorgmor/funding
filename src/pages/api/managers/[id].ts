import type { APIRoute } from "astro";
import {
  getManagerProfile,
  updateManagerProfile,
} from "@/lib/funds/store";
import { managerDisplayName } from "@/lib/funds/managers-dynamodb";

export const prerender = false;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const BIO_MAX = 160;
const USERNAME_MAX = 40;
/** DynamoDB item soft cap — keep avatars small. */
const AVATAR_MAX_CHARS = 350_000;

export const GET: APIRoute = async ({ params }) => {
  const address = params.id?.trim() ?? "";
  if (!ADDRESS_RE.test(address)) {
    return new Response(JSON.stringify({ error: "Invalid address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await getManagerProfile(address);
  if (!profile) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      address: profile.id,
      name: managerDisplayName(profile),
      username: profile.username,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      verified: profile.verified,
      polymarketName: profile.name,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=30",
      },
    },
  );
};

export const PUT: APIRoute = async ({ params, request }) => {
  const address = params.id?.trim() ?? "";
  if (!ADDRESS_RE.test(address)) {
    return new Response(JSON.stringify({ error: "Invalid address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    username?: unknown;
    bio?: unknown;
    avatarUrl?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const username =
    typeof body.username === "string"
      ? body.username.trim().slice(0, USERNAME_MAX)
      : undefined;
  const bio =
    typeof body.bio === "string" ? body.bio.slice(0, BIO_MAX) : undefined;
  let avatarUrl: string | null | undefined = undefined;
  if (body.avatarUrl === null) avatarUrl = null;
  else if (typeof body.avatarUrl === "string") {
    if (body.avatarUrl.length > AVATAR_MAX_CHARS) {
      return new Response(JSON.stringify({ error: "Avatar too large" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    avatarUrl = body.avatarUrl || null;
  }

  // ponytail: no wallet signature yet — same trust model as localStorage writes
  const profile = await updateManagerProfile(address, {
    username,
    bio,
    avatarUrl,
  });

  return new Response(
    JSON.stringify({
      address: profile.id,
      name: managerDisplayName(profile),
      username: profile.username,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      verified: profile.verified,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
