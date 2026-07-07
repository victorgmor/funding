import { defineConfig, envField } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import node from "@astrojs/node";

export default defineConfig({
  output: "static",
  adapter: node({ mode: "standalone" }),
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
  site: "https://yourdomain.com",
  integrations: [react(), sitemap(), mdx()],
});
