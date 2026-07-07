import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { getSecret } from "astro:env/server";

/** Relayer HMAC creds — server-only; use in API routes. */
export function getRelayBuilderConfig(): BuilderConfig | undefined {
  const key = getSecret("POLY_BUILDER_API_KEY")?.trim();
  const secret = getSecret("POLY_BUILDER_API_SECRET")?.trim();
  const passphrase = getSecret("POLY_BUILDER_PASSPHRASE")?.trim();
  if (!key || !secret || !passphrase) return undefined;

  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  });
}
