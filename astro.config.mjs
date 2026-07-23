import { defineConfig, envField } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import node from "@astrojs/node";

const site =
  process.env.SITE_URL?.trim() ||
  process.env.PUBLIC_SITE_URL?.trim() ||
  "http://localhost:4321";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  site,
  env: {
    schema: {
      POLY_BUILDER_API_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      POLY_BUILDER_API_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      POLY_BUILDER_PASSPHRASE: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PUBLIC_POLY_BUILDER_CODE: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_PRIVY_APP_ID: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_PRIVY_SIGNER_QUORUM_ID: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PRIVY_APP_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PRIVY_AUTHORIZATION_PRIVATE_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      SITE_URL: envField.string({
        context: "server",
        access: "public",
        optional: true,
      }),
      FUNDS_TABLE: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      CHALLENGES_TABLE: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      MANDATES_TABLE: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      MANAGERS_TABLE: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      AWS_REGION: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    define: {
      global: "globalThis",
    },
  },
  markdown: {
    drafts: true,
    shikiConfig: {
      theme: "css-variables",
    },
  },
  shikiConfig: {
    wrap: true,
    skipInline: false,
    drafts: true,
  },
  integrations: [react(), sitemap()],
});
