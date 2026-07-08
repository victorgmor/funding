import { defineConfig, envField } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
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
  integrations: [react(), sitemap(), mdx()],
});
