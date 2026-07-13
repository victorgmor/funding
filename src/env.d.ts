/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PRIVY_APP_ID?: string;
  readonly PUBLIC_PRIVY_SIGNER_QUORUM_ID?: string;
  readonly PUBLIC_ADMIN_ADDRESSES?: string;
  readonly PUBLIC_POLY_BUILDER_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
