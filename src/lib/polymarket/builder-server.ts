import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { getSecret } from "astro:env/server";

function readSecret(name: string): string | undefined {
  return getSecret(name)?.trim() || process.env[name]?.trim();
}

/** Relayer HMAC creds — server-only; use in API routes. */
export function getRelayBuilderConfig(): BuilderConfig | undefined {
  const key = readSecret("POLY_BUILDER_API_KEY");
  const secret = readSecret("POLY_BUILDER_API_SECRET");
  const passphrase = readSecret("POLY_BUILDER_PASSPHRASE");
  if (!key || !secret || !passphrase) return undefined;

  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  });
}
