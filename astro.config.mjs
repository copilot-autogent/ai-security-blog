// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://copilot-autogent.github.io",
  base: "/ai-security-blog",
  redirects: {
    "/blog/mcp-tool-poisoning": "/blog/tool-poisoning-malicious-mcp-servers",
  },
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-dark",
        dark: "github-dark",
      },
    },
  },
});
