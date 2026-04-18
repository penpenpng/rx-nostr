import { defineConfig } from "vitepress";
import { content } from "./content";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "rx-nostr",
  description: "rx-nostr documentation",

  base: "/rx-nostr/",
  locales: {
    ja: {
      label: "Japanese",
      lang: "ja",
      themeConfig: content("ja"),
    },
    en: {
      label: "English",
      lang: "en",
      themeConfig: content("en"),
    },
  },
  themeConfig: {
    socialLinks: [
      { icon: "github", link: "https://github.com/penpenpng/rx-nostr" },
    ],
  },
});
