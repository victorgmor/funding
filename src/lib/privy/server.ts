import { PrivyClient, type AuthorizationContext } from "@privy-io/node";

let client: PrivyClient | undefined;

export function privyAppSecret(): string | undefined {
  return process.env.PRIVY_APP_SECRET?.trim() || undefined;
}

export function privyAuthorizationPrivateKey(): string | undefined {
  return process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim() || undefined;
}

export function serverSigningEnabled(): boolean {
  const appId = process.env.PUBLIC_PRIVY_APP_ID?.trim();
  return Boolean(appId && privyAppSecret() && privyAuthorizationPrivateKey());
}

export function getPrivyServerClient(): PrivyClient {
  if (client) return client;

  const appId = process.env.PUBLIC_PRIVY_APP_ID?.trim();
  const appSecret = privyAppSecret();
  if (!appId || !appSecret) {
    throw new Error("Privy server credentials not configured");
  }

  client = new PrivyClient({ appId, appSecret });
  return client;
}

export function getAuthorizationContext(): AuthorizationContext {
  const privateKey = privyAuthorizationPrivateKey();
  if (!privateKey) {
    throw new Error("PRIVY_AUTHORIZATION_PRIVATE_KEY not configured");
  }
  return { authorization_private_keys: [privateKey] };
}
