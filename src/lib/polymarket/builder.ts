import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import type { BuilderConfig as ClobBuilderConfig } from "@polymarket/clob-client-v2";

/** bytes32 builder code from polymarket.com/settings → Builder (safe to expose client-side). */
export function getBuilderCode(): string | undefined {
  const code = import.meta.env.PUBLIC_POLY_BUILDER_CODE?.trim();
  return code || undefined;
}

export function getClobBuilderConfig(): ClobBuilderConfig | undefined {
  const builderCode = getBuilderCode();
  return builderCode ? { builderCode } : undefined;
}

/** Browser relayer auth via server-side HMAC signing. */
export function getClientRelayBuilderConfig(): BuilderConfig | undefined {
  if (typeof window === "undefined") return undefined;

  return new BuilderConfig({
    remoteBuilderConfig: {
      url: `${window.location.origin}/api/polymarket/builder-sign`,
    },
  });
}
